import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { HelpCircle, Search, Globe, Download, FileText, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRegion } from "@/contexts/RegionContext";
import { useFAQ } from "@/hooks/useFAQ";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const FAQ = () => {
  const { country } = useRegion();
  const regionFilter = country === 'USA' ? 'USA' : 'Nigeria';
  const { categories, items, loading } = useFAQ(regionFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filter items by search and category
  const filteredItems = useMemo(() => {
    let filtered = items;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.question.toLowerCase().includes(query) ||
        item.answer.toLowerCase().includes(query)
      );
    }
    
    if (selectedCategory) {
      filtered = filtered.filter(item => item.category_id === selectedCategory);
    }
    
    return filtered;
  }, [items, searchQuery, selectedCategory]);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, typeof items> = {};
    filteredItems.forEach(item => {
      const categoryId = item.category_id;
      if (!groups[categoryId]) {
        groups[categoryId] = [];
      }
      groups[categoryId].push(item);
    });
    return groups;
  }, [filteredItems]);

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
  };

  const [downloading, setDownloading] = useState(false);

  // Builds a printable PDF of every FAQ visible to the current region.
  const handleDownloadPdf = async () => {
    if (!items.length) {
      toast.error("No FAQ content available to download yet.");
      return;
    }
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      const width = doc.internal.pageSize.getWidth() - margin * 2;
      const bottom = doc.internal.pageSize.getHeight() - margin;
      let y = margin;

      const addLines = (text: string, size: number, style: "bold" | "normal", gap = 6) => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        for (const line of doc.splitTextToSize(text, width)) {
          if (y > bottom) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += size + 2;
        }
        y += gap;
      };

      addLines("Rentmaikar — Frequently Asked Questions", 18, "bold", 4);
      addLines(
        `Region: ${regionFilter === "USA" ? "United States" : "Nigeria"} · Generated ${new Date().toLocaleDateString()}`,
        10,
        "normal",
        14,
      );

      const order = categories.length
        ? categories.map((c) => c.id)
        : Array.from(new Set(items.map((i) => i.category_id)));

      order.forEach((categoryId) => {
        const list = items.filter((i) => i.category_id === categoryId);
        if (!list.length) return;
        addLines(getCategoryName(categoryId), 14, "bold", 4);
        list.forEach((item, idx) => {
          addLines(`${idx + 1}. ${item.question}`, 11, "bold", 2);
          addLines(item.answer, 10, "normal", 10);
        });
      });

      addLines(
        "Rentmaikar operates as a technology-enabled marketplace and administrator. Fees, policies and supported features may change with notice.",
        9,
        "normal",
        0,
      );

      doc.save(`rentmaikar-faq-${regionFilter.toLowerCase()}.pdf`);
      toast.success("FAQ downloaded");
    } catch (error) {
      console.error("FAQ download failed", error);
      toast.error("Could not generate the FAQ download. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const faqJsonLd = items.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.slice(0, 25).map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="FAQ — Rentmaikar Rideshare Rentals"
        description="Answers to common questions about renting a rideshare vehicle, listing your car, payments, verification and support on Rentmaikar."
        path="/faq"
        jsonLd={faqJsonLd}
      />
      <Header />
      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <HelpCircle className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Find answers to common questions about Rentmaikar's vehicle leasing and rental platform.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Showing content for {regionFilter === 'USA' ? 'United States' : 'Nigeria'}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="outline">
              <Link to="/terms">
                <FileText className="h-4 w-4" /> View Terms
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/privacy">
                <Shield className="h-4 w-4" /> View Privacy Policy
              </Link>
            </Button>
            <Button onClick={handleDownloadPdf} disabled={downloading || loading}>
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download FAQ (PDF)
            </Button>
          </div>
        </div>


        {/* Search */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search FAQ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Category Tabs */}
        {loading ? (
          <div className="space-y-4 max-w-4xl mx-auto">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <Tabs
            value={selectedCategory || 'all'}
            onValueChange={(value) => setSelectedCategory(value === 'all' ? null : value)}
            className="max-w-4xl mx-auto"
          >
            <TabsList className="flex flex-wrap justify-center gap-2 h-auto bg-transparent mb-8">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                All
              </TabsTrigger>
              {categories.map(category => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {category.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* All items view */}
            <TabsContent value="all">
              {Object.keys(groupedItems).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? 'No results found for your search.' : 'No FAQ items available.'}
                </div>
              ) : (
                Object.entries(groupedItems).map(([categoryId, categoryItems]) => (
                  <div key={categoryId} className="mb-8">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      {getCategoryName(categoryId)}
                      <Badge variant="secondary">{categoryItems.length}</Badge>
                    </h2>
                    <Accordion type="single" collapsible className="space-y-2">
                      {categoryItems.map((item) => (
                        <AccordionItem
                          key={item.id}
                          value={item.id}
                          className="border rounded-lg px-4 bg-card"
                        >
                          <AccordionTrigger className="text-left hover:no-underline">
                            <span className="font-medium">{item.question}</span>
                          </AccordionTrigger>
                          <AccordionContent className="text-muted-foreground">
                            {item.answer}
                            {item.region !== 'all' && (
                              <Badge variant="outline" className="ml-2 mt-2">
                                {item.region}
                              </Badge>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Category-specific views */}
            {categories.map(category => (
              <TabsContent key={category.id} value={category.id}>
                {category.description && (
                  <p className="text-muted-foreground mb-6">{category.description}</p>
                )}
                {groupedItems[category.id]?.length > 0 ? (
                  <Accordion type="single" collapsible className="space-y-2">
                    {groupedItems[category.id]?.map((item) => (
                      <AccordionItem
                        key={item.id}
                        value={item.id}
                        className="border rounded-lg px-4 bg-card"
                      >
                        <AccordionTrigger className="text-left hover:no-underline">
                          <span className="font-medium">{item.question}</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {item.answer}
                          {item.region !== 'all' && (
                            <Badge variant="outline" className="ml-2 mt-2">
                              {item.region}
                            </Badge>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No FAQ items in this category.
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Legal Disclaimer */}
        <div className="max-w-4xl mx-auto mt-12 p-6 bg-muted/50 rounded-lg">
          <h3 className="font-semibold mb-2">Legal & Policy Disclaimers</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Rentmaikar operates as a technology-enabled marketplace and administrator. We are not the vehicle owner or the driver.</li>
            <li>• All rentals are subject to platform terms, regional laws, and compliance requirements.</li>
            <li>• Rentmaikar reserves the right to suspend or terminate accounts for violations, fraud, or safety concerns.</li>
            <li>• Fees, policies, and supported features may change with notice.</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4">Last updated: 2026</p>
        </div>

        <p className="max-w-4xl mx-auto mt-8 text-center text-sm text-muted-foreground">
          Deciding between a rental and buying your own car?{" "}
          <Link
            to="/guides/renting-vs-owning-for-rideshare"
            className="text-primary underline underline-offset-4"
          >
            Compare renting vs. owning for rideshare
          </Link>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default FAQ;
