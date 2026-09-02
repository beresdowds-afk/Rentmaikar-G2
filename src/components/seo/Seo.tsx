import { Helmet } from "react-helmet-async";

export const SITE_URL = "https://rentmaikar.com";

const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_IMAGE_ALT =
  "Rentmaikar — rideshare-ready vehicle rentals in the USA and Nigeria";

interface SeoProps {
  title: string;
  description: string;
  /** Route path, e.g. "/faq". Used for canonical + og:url. */
  path: string;
  image?: string;
  /** Alt text for the social preview image. */
  imageAlt?: string;
  type?: "website" | "article";
  /** Optional JSON-LD object(s) for this route. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

/**
 * Per-route head tags: unique title/description, self-referencing canonical
 * and og:url, absolute social images, and optional JSON-LD.
 */
export default function Seo({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  imageAlt = DEFAULT_IMAGE_ALT,
  type = "website",
  jsonLd,
  noindex,
}: SeoProps) {
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Rentmaikar" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={imageAlt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@Rentmaikar" />
      <meta name="twitter:creator" content="@Rentmaikar" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={imageAlt} />


      {blocks.map((block, i) => (
        <script type="application/ld+json" key={i}>
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}
