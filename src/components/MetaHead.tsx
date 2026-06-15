import { forwardRef } from "react";
import { Helmet } from "react-helmet-async";

interface MetaHeadProps {
  title: string;
  description?: string;
  image?: string;
}

const BASE_TITLE = "NC Performance Hub";
const DEFAULT_DESCRIPTION =
  "Piattaforma completa per coaching fitness ibrido. Dashboard coach e app atleti.";
const DEFAULT_IMAGE = "https://lovable.dev/opengraph-image-p98pqg.png";

export const MetaHead = forwardRef<HTMLDivElement, MetaHeadProps>(function MetaHead(
  { title, description, image },
  _ref,
) {
  const fullTitle = `${title} | ${BASE_TITLE}`;
  const desc = description ?? DEFAULT_DESCRIPTION;
  const img = image ?? DEFAULT_IMAGE;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
});
