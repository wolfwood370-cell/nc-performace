import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import { COACH_ROSTER_QUERY_OPTS } from "@/lib/coachQueries";
import { useToast } from "./use-toast";

// ===== TYPE DEFINITIONS =====

interface CoachProduct {
  id: string;
  coach_id: string;
  name: string;
  price: number;
  billing_period: "monthly" | "one-time" | "yearly";
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface AthleteSubscription {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  subscription_status: "active" | "past_due" | "canceled" | "trial" | "none";
  subscription_tier: string | null;
  current_period_end: string | null;
}

interface Invoice {
  id: string;
  athlete_id: string;
  coach_id: string;
  product_id: string | null;
  amount: number;
  status: "paid" | "pending" | "failed" | "refunded";
  invoice_date: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  athlete?: {
    full_name: string | null;
  };
}

interface BusinessMetrics {
  estimatedMRR: number;
  activeClients: number;
  pendingPayments: number;
  pendingAmount: number;
}

export interface CreateProductPayload {
  name: string;
  price: number;
  billing_period: "monthly" | "one-time" | "yearly";
  description?: string;
}

export interface UpdateSubscriptionPayload {
  athleteId: string;
  status: "active" | "past_due" | "canceled" | "trial" | "none";
  tier?: string;
  periodEnd?: string;
}

export interface AssignSubscriptionPayload {
  athleteId: string;
  productId: string;
  productName: string;
  startDate: Date;
  periodEnd: Date;
  price: number;
}

// ===== MAIN HOOK =====

export function useCoachBusinessData() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ===== QUERY: Products =====
  const {
    data: products = [],
    isLoading: productsLoading,
    error: productsError,
  } = useQuery({
    queryKey: ["coach-products", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("coach_products")
        .select("*")
        .eq("coach_id", user.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CoachProduct[];
    },
    enabled: !!user,
  });

  // ===== QUERY: Athlete Subscriptions =====
  const {
    data: athleteSubscriptions = [],
    isLoading: subscriptionsLoading,
    error: subscriptionsError,
  } = useQuery({
    queryKey: ["athlete-subscriptions", user?.id],
    ...COACH_ROSTER_QUERY_OPTS,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, avatar_url, subscription_status, subscription_tier, current_period_end",
        )
        .eq("coach_id", user.id)
        .eq("role", "athlete");
      if (error) throw error;
      return data as AthleteSubscription[];
    },
    enabled: !!user,
  });

  // ===== QUERY: Invoices =====
  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    error: invoicesError,
  } = useQuery({
    queryKey: ["coach-invoices", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("coach_id", user.id)
        .order("invoice_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!user,
  });

  // ===== COMPUTED: Business Metrics =====
  const businessMetrics: BusinessMetrics = {
    estimatedMRR: athleteSubscriptions
      .filter((a) => a.subscription_status === "active" && a.subscription_tier)
      .reduce((sum, athlete) => {
        const product = products.find(
          (p) => p.name === athlete.subscription_tier && p.billing_period === "monthly",
        );
        return sum + (product?.price ?? 50); // Default €50 if no matching product
      }, 0),
    activeClients: athleteSubscriptions.filter(
      (a) => a.subscription_status === "active" || a.subscription_status === "trial",
    ).length,
    pendingPayments: invoices.filter((i) => i.status === "pending").length,
    pendingAmount: invoices
      .filter((i) => i.status === "pending")
      .reduce((sum, i) => sum + Number(i.amount), 0),
  };

  // ===== MUTATION: Create Product =====
  const createProductMutation = useMutation({
    mutationFn: async (payload: CreateProductPayload) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("coach_products")
        .insert({
          coach_id: user.id,
          name: payload.name,
          price: payload.price,
          billing_period: payload.billing_period,
          description: payload.description || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-products"] });
      toast({ title: "Product created", description: "Your new product has been added." });
    },
    onError: (error) => {
      toast({
        title: "Failed to create product",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ===== MUTATION: Delete Product =====
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from("coach_products")
        .update({ active: false })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-products"] });
      toast({ title: "Product archived", description: "The product has been removed." });
    },
    onError: (error) => {
      toast({
        title: "Failed to archive product",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ===== MUTATION: Update Athlete Subscription =====
  const updateSubscriptionMutation = useMutation({
    mutationFn: async (payload: UpdateSubscriptionPayload) => {
      // Typed partial update against the generated profiles.Update
      // shape so adding/renaming a column lights up the call site
      // instead of silently passing the wrong key.
      const updateData: TablesUpdate<"profiles"> = {
        subscription_status: payload.status,
      };
      if (payload.tier !== undefined) {
        updateData.subscription_tier = payload.tier;
      }
      if (payload.periodEnd !== undefined) {
        updateData.current_period_end = payload.periodEnd;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", payload.athleteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete-subscriptions"] });
      toast({
        title: "Subscription updated",
        description: "Athlete subscription has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update subscription",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ===== MUTATION: Mark Invoice as Paid =====
  const markInvoicePaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-invoices"] });
      toast({ title: "Invoice marked as paid", description: "Payment has been recorded." });
    },
    onError: (error) => {
      toast({
        title: "Failed to update invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ===== MUTATION: Assign Subscription =====
  const assignSubscriptionMutation = useMutation({
    mutationFn: async (payload: AssignSubscriptionPayload) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Update athlete's profile with subscription info
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          subscription_status: "active",
          subscription_tier: payload.productName,
          current_period_end: payload.periodEnd.toISOString(),
        })
        .eq("id", payload.athleteId);

      if (profileError) throw profileError;

      // 2. Create an invoice record for tracking
      const { error: invoiceError } = await supabase.from("invoices").insert({
        coach_id: user.id,
        athlete_id: payload.athleteId,
        product_id: payload.productId,
        amount: payload.price,
        status: "pending",
        invoice_date: payload.startDate.toISOString(),
        notes: `Subscription assigned: ${payload.productName}`,
      });

      if (invoiceError) throw invoiceError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["coach-invoices"] });
      toast({
        title: "Subscription assigned",
        description: "The athlete's subscription has been activated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to assign subscription",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ===== COMBINED STATE =====
  const isLoading = productsLoading || subscriptionsLoading || invoicesLoading;
  const error = productsError || subscriptionsError || invoicesError;

  return {
    // Data
    products,
    athleteSubscriptions,
    invoices,
    businessMetrics,
    // Loading/Error
    isLoading,
    error: error as Error | null,
    // Mutations
    createProduct: createProductMutation.mutate,
    isCreatingProduct: createProductMutation.isPending,
    deleteProduct: deleteProductMutation.mutate,
    updateSubscription: updateSubscriptionMutation.mutate,
    markInvoicePaid: markInvoicePaidMutation.mutate,
    assignSubscription: assignSubscriptionMutation.mutate,
    isAssigningSubscription: assignSubscriptionMutation.isPending,
  };
}
