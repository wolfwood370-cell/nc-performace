import { forwardRef } from "react";
import { Link } from "react-router-dom";

export const Footer = forwardRef<HTMLElement>(function Footer(_props, ref) {
  return (
    <footer ref={ref} className="border-t border-border/50 py-8">
      <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} NC Performance Hub. Tutti i diritti riservati.</span>
        <nav className="flex items-center gap-6">
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Termini di Servizio
          </Link>
          <a href="mailto:info@coachhub.app" className="hover:text-foreground transition-colors">
            Contatti
          </a>
        </nav>
      </div>
    </footer>
  );
});
