import { MetaHead } from "@/components/MetaHead";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";

export default function PrivacyPolicy() {
  return (
    <>
      <MetaHead
        title="Privacy | NC Performance Hub"
        description="Informativa sulla privacy di NC Performance Hub."
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Informativa sulla Privacy</h1>
          <p className="text-muted-foreground text-sm mb-10">
            Ultimo aggiornamento: 16 Febbraio 2026
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground/90">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">1. Titolare del trattamento</h2>
              <p className="leading-relaxed text-muted-foreground">
                Il titolare del trattamento dei dati personali è NC Performance Hub ("noi",
                "nostro"). Per qualsiasi domanda relativa alla privacy, è possibile contattarci
                all'indirizzo email: privacy@coachhub.app.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">2. Dati raccolti</h2>
              <p className="leading-relaxed text-muted-foreground">
                Raccogliamo le seguenti categorie di dati: dati identificativi (nome, email), dati
                di utilizzo della piattaforma, dati relativi all'allenamento e alla nutrizione, e
                dati di pagamento elaborati tramite Stripe.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">3. Finalità del trattamento</h2>
              <p className="leading-relaxed text-muted-foreground">
                I dati personali sono trattati per: erogazione del servizio, personalizzazione
                dell'esperienza, comunicazioni relative al servizio, analisi aggregate e
                anonimizzate per il miglioramento della piattaforma.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">4. Conservazione dei dati</h2>
              <p className="leading-relaxed text-muted-foreground">
                I dati personali sono conservati per la durata dell'utilizzo del servizio e per un
                periodo massimo di 24 mesi dalla cessazione dell'account, salvo diversi obblighi di
                legge.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">5. Diritti dell'utente</h2>
              <p className="leading-relaxed text-muted-foreground">
                L'utente ha il diritto di accedere, rettificare, cancellare i propri dati, nonché di
                opporsi al trattamento e richiedere la portabilità dei dati, contattandoci
                all'indirizzo email sopra indicato.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">6. Cookie</h2>
              <p className="leading-relaxed text-muted-foreground">
                La piattaforma utilizza cookie tecnici strettamente necessari al funzionamento del
                servizio. Non vengono utilizzati cookie di profilazione di terze parti a fini
                pubblicitari.
              </p>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
