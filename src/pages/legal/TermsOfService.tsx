import { MetaHead } from "@/components/MetaHead";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";

export default function TermsOfService() {
  return (
    <>
      <MetaHead
        title="Termini di Servizio | NC Performance Hub"
        description="Termini e condizioni d'uso di NC Performance Hub."
      />
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Torna alla Home
              </Link>
            </Button>
          </div>
        </header>

        <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Termini di Servizio</h1>
          <p className="text-muted-foreground text-sm mb-10">
            Ultimo aggiornamento: 16 Febbraio 2026
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground/90">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">1. Accettazione dei termini</h2>
              <p className="leading-relaxed text-muted-foreground">
                Utilizzando la piattaforma NC Performance Hub, l'utente accetta integralmente i
                presenti Termini di Servizio. L'accesso e l'utilizzo del servizio sono subordinati
                all'accettazione di tali condizioni.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">2. Descrizione del servizio</h2>
              <p className="leading-relaxed text-muted-foreground">
                NC Performance Hub è una piattaforma digitale che connette coach e atleti, offrendo
                strumenti per la pianificazione degli allenamenti, il monitoraggio della nutrizione,
                l'analisi delle performance e la comunicazione.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">3. Account utente</h2>
              <p className="leading-relaxed text-muted-foreground">
                L'utente è responsabile della riservatezza delle proprie credenziali di accesso e di
                tutte le attività svolte tramite il proprio account. È obbligatorio fornire
                informazioni accurate e aggiornate.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">4. Pagamenti e abbonamenti</h2>
              <p className="leading-relaxed text-muted-foreground">
                I pagamenti sono elaborati tramite Stripe. Gli abbonamenti si rinnovano
                automaticamente salvo disdetta. Le tariffe sono indicate chiaramente prima della
                sottoscrizione. I rimborsi sono gestiti secondo la politica indicata nella sezione
                dedicata.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">5. Proprietà intellettuale</h2>
              <p className="leading-relaxed text-muted-foreground">
                Tutti i contenuti della piattaforma, inclusi testi, grafiche, loghi e software, sono
                di proprietà di NC Performance Hub o dei rispettivi titolari. È vietata la
                riproduzione non autorizzata.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">6. Limitazione di responsabilità</h2>
              <p className="leading-relaxed text-muted-foreground">
                NC Performance Hub non fornisce consulenza medica. I programmi di allenamento e
                nutrizione sono a scopo informativo. L'utente è invitato a consultare un
                professionista sanitario prima di iniziare qualsiasi programma.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">7. Legge applicabile</h2>
              <p className="leading-relaxed text-muted-foreground">
                I presenti termini sono regolati dalla legge italiana. Per qualsiasi controversia
                sarà competente il Foro di Milano.
              </p>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
