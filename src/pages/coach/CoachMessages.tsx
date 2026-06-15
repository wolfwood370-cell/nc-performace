import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { RoomList } from "@/components/coach/messages/RoomList";
import { ChatPane } from "@/components/coach/messages/ChatPane";
import { AthleteContextPane } from "@/components/coach/messages/AthleteContextPane";
import { NewChatDialog } from "@/components/coach/messages/NewChatDialog";
import { useChatRooms, ChatRoom } from "@/hooks/useChatRooms";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CoachMessages() {
  const [searchParams] = useSearchParams();
  const { rooms, isLoading, getOrCreateDirectRoom, markRoomAsRead } = useChatRooms();
  const isMobile = useIsMobile();

  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [showRoomList, setShowRoomList] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  // Holds the id of a freshly-created room while we wait for the
  // `useChatRooms` query to refetch and surface it. A dedicated effect
  // (below) consumes this id once the matching room arrives in `rooms`
  // and selects it — replaces the previous `setTimeout(500)` hack which
  // was fragile on slow networks.
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);

  // Parse alert context from URL
  const alertContextParam = searchParams.get("alertContext");
  const alertContext = alertContextParam
    ? (() => {
        try {
          return JSON.parse(decodeURIComponent(alertContextParam));
        } catch {
          return null;
        }
      })()
    : null;

  // Auto-select room from URL param
  const roomIdParam = searchParams.get("room");
  useEffect(() => {
    if (roomIdParam && rooms.length > 0 && !selectedRoom) {
      const room = rooms.find((r) => r.id === roomIdParam);
      if (room) {
        setSelectedRoom(room);
        markRoomAsRead.mutate(room.id);
        if (isMobile) setShowRoomList(false);
      }
    }
  }, [roomIdParam, rooms, selectedRoom, markRoomAsRead, isMobile]);

  // Update selected room when rooms change (to get fresh data)
  useEffect(() => {
    if (selectedRoom) {
      const updated = rooms.find((r) => r.id === selectedRoom.id);
      if (updated && updated !== selectedRoom) {
        setSelectedRoom(updated);
      }
    }
  }, [rooms, selectedRoom]);

  // Consume the pending room id once the rooms query surfaces a matching
  // entry. Auto-selects + marks as read + collapses the list on mobile.
  // Replaces the setTimeout(500) timing hack: the effect fires as soon
  // as the data is actually there, not on a guessed delay.
  useEffect(() => {
    if (!pendingRoomId || rooms.length === 0) return;
    const room = rooms.find((r) => r.id === pendingRoomId);
    if (!room) return;
    setSelectedRoom(room);
    markRoomAsRead.mutate(room.id);
    if (isMobile) setShowRoomList(false);
    setPendingRoomId(null);
  }, [pendingRoomId, rooms, markRoomAsRead, isMobile]);

  const handleSelectRoom = (room: ChatRoom) => {
    setSelectedRoom(room);
    markRoomAsRead.mutate(room.id);
    if (isMobile) {
      setShowRoomList(false);
    }
  };

  const handleBack = () => {
    if (isMobile) {
      setShowRoomList(true);
      setSelectedRoom(null);
    }
  };

  const handleToggleContext = () => {
    setShowContext(!showContext);
  };

  const handleNewChat = async (athleteId: string) => {
    setIsCreatingRoom(true);
    try {
      const roomId = await getOrCreateDirectRoom.mutateAsync(athleteId);
      setNewChatOpen(false);
      // Stash the new room id; the useEffect above selects it the
      // moment the rooms query surfaces it. No timing assumption.
      setPendingRoomId(roomId);
      toast.success("Conversazione pronta");
    } catch {
      toast.error("Errore nella creazione della chat");
    } finally {
      setIsCreatingRoom(false);
    }
  };

  return (
    <CoachLayout title="Centro Comunicazioni" subtitle="Messaggi e contesto atleti">
      {/* ── Aura 3-Column Workspace ──
          Full-screen viewport bounds (DESIGN.md). The CoachLayout already
          provides bg-background (Aura surface #f5faff); here we own the
          horizontal flex split. Each column is rounded-3xl on its own
          surface card so the gaps reveal the canvas tint underneath. */}
      <div className="animate-fade-in h-[calc(100vh-2rem)] flex overflow-hidden p-4 gap-4 bg-surface font-sans">
        {/* ═══ Column 1 — Left Directory (w-80, ~3/12) ═══ */}
        <aside
          className={cn(
            "w-80 shrink-0 h-full overflow-hidden flex flex-col",
            "rounded-3xl bg-surface-container-lowest border border-outline-variant/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
            isMobile && !showRoomList && "hidden",
          )}
        >
          <RoomList
            rooms={rooms}
            isLoading={isLoading}
            selectedRoomId={selectedRoom?.id || null}
            onSelectRoom={handleSelectRoom}
            onNewChat={() => setNewChatOpen(true)}
          />
        </aside>

        {/* ═══ Column 2 — Chat (flex-1) ═══ */}
        <main
          className={cn(
            "flex-1 h-full min-w-0 overflow-hidden flex flex-col",
            "rounded-3xl bg-surface-container-lowest border border-outline-variant/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
            isMobile && showRoomList && "hidden",
          )}
        >
          <ChatPane
            room={selectedRoom}
            onBack={handleBack}
            onToggleContext={handleToggleContext}
            showBackButton={isMobile}
            alertContext={alertContext}
          />
        </main>

        {/* ═══ Column 3 — Athlete Context (w-80, desktop-only) ═══ */}
        <aside
          className={cn(
            "w-80 shrink-0 h-full overflow-hidden flex-col hidden lg:flex",
            "rounded-3xl bg-surface-container-lowest border border-outline-variant/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
          )}
        >
          <AthleteContextPane
            room={selectedRoom}
            isOpen={true}
            onClose={() => setShowContext(false)}
          />
        </aside>

        {/* Mobile Context Overlay */}
        {isMobile && (
          <>
            {showContext && (
              <button
                type="button"
                aria-label="Chiudi pannello contesto"
                className="fixed inset-0 bg-black/50 z-40 cursor-default"
                onClick={() => setShowContext(false)}
              />
            )}
            <AthleteContextPane
              room={selectedRoom}
              isOpen={showContext}
              onClose={() => setShowContext(false)}
            />
          </>
        )}

        {/* New Chat Dialog */}
        <NewChatDialog
          open={newChatOpen}
          onOpenChange={setNewChatOpen}
          onSelectAthlete={handleNewChat}
          isCreating={isCreatingRoom}
        />
      </div>
    </CoachLayout>
  );
}
