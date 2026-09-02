import Seo, { SITE_URL } from "@/components/seo/Seo";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Minus, ArrowRight } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";

const PATH = "/guides/renting-vs-owning-for-rideshare";

const RentingVsOwning = () => {
  const { country } = useRegion();
  const isNigeria = country === "Nigeria";

  const platforms = isNigeria ? "Uber, Bolt or InDrive" : "Uber, Lyft or a delivery app";
  const currency = isNigeria ? "naira" : "dollar";
  const paymentRail = isNigeria ? "Paystack" : "PayPal";
  const inspectionDoc = isNigeria
    ? "roadworthiness certificate"
    : "state vehicle inspection certificate";

  const title = "Renting vs. Owning a Car for Rideshare | Rentmaikar";
  const description =
    "A practical comparison of renting a rideshare-ready vehicle versus buying your own: upfront cost, maintenance, insurance, downtime risk and how to choose.";

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Renting vs. Owning a Car for Rideshare Driving",
      description,
      mainEntityOfPage: `${SITE_URL}${PATH}`,
      publisher: {
        "@type": "Organization",
        name: "Rentmaikar",
        url: SITE_URL,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Renting vs. Owning for Rideshare",
          item: `${SITE_URL}${PATH}`,
        },
      ],
    },
  ];

  const rows: { factor: string; renting: string; owning: string }[] = [
    {
      factor: "Upfront cost",
      renting: `A security deposit and your first rental payment, made in ${currency} through ${paymentRail}.`,
      owning: "Full purchase price or a loan down payment, plus registration and initial repairs.",
    },
    {
      factor: "Maintenance & repairs",
      renting: "Handled under the rental — servicing is scheduled and coordinated by the platform.",
      owning: "Entirely yours: parts, labour, and the earnings lost while the car is in the workshop.",
    },
    {
      factor: "Insurance",
      renting: "Bundled as a subscription tied to the active rental.",
      owning: "You source and renew commercial-grade cover yourself.",
    },
    {
      factor: "Compliance paperwork",
      renting: `Vehicle papers and the ${inspectionDoc} are kept current for you.`,
      owning: "You track every renewal and inspection date.",
    },
    {
      factor: "Downtime risk",
      renting: "A recalled or off-road vehicle can be swapped through the platform.",
      owning: "No car means no income until it is repaired.",
    },
    {
      factor: "Long-term equity",
      renting: "None while renting — unless you move to a rent-to-own plan.",
      owning: "You keep the asset and its resale value, minus depreciation.",
    },
    {
      factor: "Flexibility",
      renting: "Stop when the agreement ends; upgrade or downgrade tiers as demand changes.",
      owning: "Selling a car takes time and usually loses value.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Seo title={title} description={description} path={PATH} type="article" jsonLd={jsonLd} />
      <Header />

      <main className="flex-1">
        <section className="border-b border-border/60 bg-muted/30">
          <div className="container mx-auto px-4 py-14 max-w-3xl">
            <p className="text-sm font-medium text-primary mb-3">Driver guide</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Renting vs. Owning a Car for Rideshare Driving
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              If you drive for {platforms}, the vehicle is your biggest cost. This guide compares
              renting a rideshare-ready car through Rentmaikar with buying one outright, so you can
              pick the option that matches your cash flow and how long you plan to drive.
            </p>
          </div>
        </section>

        <article className="container mx-auto px-4 py-12 max-w-3xl space-y-12">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">The short answer</h2>
            <p className="text-muted-foreground">
              Renting suits drivers who want to start quickly, keep costs predictable and avoid
              repair risk. Owning suits drivers with capital to spare, a long horizon, and the
              appetite to manage servicing, insurance and paperwork themselves. Most new drivers
              rent first, then decide once they know their weekly earnings.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Side-by-side comparison</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Renting versus owning a rideshare vehicle, by cost factor
                </caption>
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="text-left p-3 font-semibold">Factor</th>
                    <th scope="col" className="text-left p-3 font-semibold">Renting</th>
                    <th scope="col" className="text-left p-3 font-semibold">Owning</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.factor} className="border-t border-border align-top">
                      <th scope="row" className="p-3 text-left font-medium">{r.factor}</th>
                      <td className="p-3 text-muted-foreground">{r.renting}</td>
                      <td className="p-3 text-muted-foreground">{r.owning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">What renting actually covers</h2>
            <p className="text-muted-foreground">
              A Rentmaikar rental is a managed arrangement rather than a bare car hire. Your
              agreement bundles the vehicle with the services that keep it earning.
            </p>
            <ul className="space-y-2">
              {[
                "A platform-approved vehicle that already meets rideshare requirements",
                "Scheduled maintenance and inspection cycles",
                "An insurance subscription tied to the active rental",
                "Driver training before you take the keys",
                "Telematics-backed tracking and recall handling",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-muted-foreground">
                  <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              See the full sequence on{" "}
              <Link to="/how-it-works" className="text-primary underline underline-offset-4">
                how renting works step by step
              </Link>
              .
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">The real costs of owning</h2>
            <p className="text-muted-foreground">
              Rideshare mileage ages a car far faster than personal use. Beyond the purchase price,
              budget for the items below before comparing against a weekly rental figure.
            </p>
            <ul className="space-y-2">
              {[
                "Servicing at shorter intervals, plus tyres, brakes and battery replacements",
                "Commercial or rideshare-endorsed insurance renewals",
                `Registration, licensing and the ${inspectionDoc}`,
                "Depreciation — high-mileage vehicles resell for noticeably less",
                "Income lost on every day the car is off the road",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-muted-foreground">
                  <Minus className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">How to decide</h2>
            <h3 className="text-xl font-semibold">Rent if…</h3>
            <p className="text-muted-foreground">
              You are starting out, testing whether rideshare works for you, cannot tie up capital
              in a car, or want repairs and insurance to be someone else's problem.
            </p>
            <h3 className="text-xl font-semibold">Buy if…</h3>
            <p className="text-muted-foreground">
              You already know your earnings, plan to drive for years, have savings for repairs, and
              are comfortable managing compliance yourself.
            </p>
            <h3 className="text-xl font-semibold">Consider rent-to-own if…</h3>
            <p className="text-muted-foreground">
              You want to end up owning a vehicle but would rather build towards it out of weekly
              earnings than pay upfront.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Choosing a vehicle tier</h2>
            <p className="text-muted-foreground">
              Rental pricing follows the vehicle tier. Browse what is available in your city:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <Link to="/catalogue/budget" className="text-primary underline underline-offset-4">
                  Budget vehicles
                </Link>{" "}
                — lowest weekly cost, best for maximising margin on standard trips.
              </li>
              <li>
                <Link to="/catalogue/standard" className="text-primary underline underline-offset-4">
                  Standard vehicles
                </Link>{" "}
                — the common choice for full-time drivers balancing comfort and cost.
              </li>
              <li>
                <Link to="/catalogue/premium" className="text-primary underline underline-offset-4">
                  Premium vehicles
                </Link>{" "}
                — access to higher-fare comfort categories where they are available.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Already own a car?</h2>
            <p className="text-muted-foreground">
              If you own a vehicle but do not want to drive it yourself, you can list it for managed
              rental income instead — Rentmaikar vets the driver, collects payments and handles
              support.{" "}
              <Link to="/owner/register" className="text-primary underline underline-offset-4">
                List your vehicle
              </Link>
              .
            </p>
          </section>

          <Card className="p-6 md:p-8 bg-muted/40 border-border">
            <h2 className="text-2xl font-semibold">Ready to start driving?</h2>
            <p className="mt-2 text-muted-foreground">
              Apply once, get verified, and pick a vehicle from the tier that fits your budget.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/driver/register">
                  Register as a driver
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/faq">Read the FAQ</Link>
              </Button>
            </div>
          </Card>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default RentingVsOwning;
