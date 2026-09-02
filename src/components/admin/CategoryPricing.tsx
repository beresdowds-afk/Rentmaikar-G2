import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DollarSign, Save, RefreshCw, Shield } from "lucide-react";

interface CategoryPrice {
  id: string;
  category: string;
  region: string;
  price: number;
  min_price: number | null;
  currency: string;
  updated_at: string;
}

interface SecurityDeposit {
  id: string;
  region: string;
  amount: number;
  currency: string;
  description: string | null;
  updated_at: string;
}

const categoryLabels: Record<string, { title: string; description: string }> = {
  budget: {
    title: "The Smart Start",
    description: "2015-2016 vehicles - Entry tier for new drivers",
  },
  standard: {
    title: "The Profit Builder",
    description: "2017-2020 vehicles - Mid-tier for growing earnings",
  },
  premium: {
    title: "The Top Earner",
    description: "2021-2025 vehicles - Premium tier for maximum income",
  },
};

export function CategoryPricing() {
  const queryClient = useQueryClient();
  const [editedPrices, setEditedPrices] = useState<Record<string, { min: number; max: number }>>({});
  const [editedDeposit, setEditedDeposit] = useState<Record<string, number>>({});
  const [activeRegion, setActiveRegion] = useState<"USA" | "NIGERIA">("USA");

  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ["category-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_category_prices")
        .select("*")
        .order("category");

      if (error) throw error;
      return data as CategoryPrice[];
    },
  });

  const { data: deposits, isLoading: depositsLoading } = useQuery({
    queryKey: ["security-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_deposit_settings")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      return data as SecurityDeposit[];
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ id, min_price, price }: { id: string; min_price: number; price: number }) => {
      const { error } = await supabase
        .from("vehicle_category_prices")
        .update({ min_price, price })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-prices"] });
      toast.success("Price range updated successfully");
    },
    onError: (error) => {
      toast.error(`Failed to update price: ${error.message}`);
    },
  });

  const updateDepositMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase
        .from("security_deposit_settings")
        .update({ amount })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-deposits"] });
      toast.success("Security deposit updated successfully");
    },
    onError: (error) => {
      toast.error(`Failed to update deposit: ${error.message}`);
    },
  });

  const handlePriceChange = (id: string, type: "min" | "max", value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditedPrices((prev) => ({
      ...prev,
      [id]: {
        min: type === "min" ? numValue : (prev[id]?.min ?? 0),
        max: type === "max" ? numValue : (prev[id]?.max ?? 0),
      },
    }));
  };

  const handleDepositChange = (id: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditedDeposit((prev) => ({ ...prev, [id]: numValue }));
  };

  const handleSavePrice = (id: string, currentMin: number, currentMax: number) => {
    const edited = editedPrices[id];
    const min_price = edited?.min ?? currentMin;
    const price = edited?.max ?? currentMax;
    
    if (min_price > price) {
      toast.error("Minimum price cannot be greater than maximum price");
      return;
    }
    
    updatePriceMutation.mutate({ id, min_price, price });
    setEditedPrices((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  const handleSaveDeposit = (id: string, currentAmount: number) => {
    const amount = editedDeposit[id] ?? currentAmount;
    updateDepositMutation.mutate({ id, amount });
    setEditedDeposit((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  const handleSaveAll = () => {
    const regionPrices = prices?.filter((p) => p.region === activeRegion) || [];
    regionPrices.forEach((price) => {
      if (editedPrices[price.id]) {
        const min_price = editedPrices[price.id].min ?? price.min_price ?? price.price * 0.8;
        const maxPrice = editedPrices[price.id].max ?? price.price;
        updatePriceMutation.mutate({ id: price.id, min_price, price: maxPrice });
      }
    });
    
    const regionDeposit = deposits?.find((d) => d.region === (activeRegion === "USA" ? "USA" : "Nigeria"));
    if (regionDeposit && editedDeposit[regionDeposit.id] !== undefined) {
      updateDepositMutation.mutate({ id: regionDeposit.id, amount: editedDeposit[regionDeposit.id] });
    }
    
    setEditedPrices({});
    setEditedDeposit({});
  };

  const getCurrencySymbol = (currency: string) => (currency === "NGN" ? "₦" : "$");

  const regionPrices = prices?.filter((p) => p.region === activeRegion) || [];
  const regionDeposit = deposits?.find((d) => d.region === (activeRegion === "USA" ? "USA" : "Nigeria"));
  const hasChanges = regionPrices.some((p) => editedPrices[p.id]) || 
    (regionDeposit && editedDeposit[regionDeposit.id] !== undefined);

  const isLoading = pricesLoading || depositsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pricing & Deposits</h2>
          <p className="text-muted-foreground">
            Manage category pricing ranges and security deposits
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSaveAll} disabled={updatePriceMutation.isPending || updateDepositMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            Save All Changes
          </Button>
        )}
      </div>

      <Tabs value={activeRegion} onValueChange={(v) => setActiveRegion(v as "USA" | "NIGERIA")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="USA">
            <span className="mr-2">🇺🇸</span> USA (USD)
          </TabsTrigger>
          <TabsTrigger value="NIGERIA">
            <span className="mr-2">🇳🇬</span> Nigeria (NGN)
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeRegion} className="mt-6 space-y-6">
          {/* Security Deposit Card */}
          {regionDeposit && (
            <Card className={editedDeposit[regionDeposit.id] !== undefined ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5 text-warning" />
                    Security Deposit
                  </CardTitle>
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                    Required
                  </Badge>
                </div>
                <CardDescription>
                  Refundable deposit required from drivers before vehicle pickup
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Deposit Amount</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        value={editedDeposit[regionDeposit.id] ?? regionDeposit.amount}
                        onChange={(e) => handleDepositChange(regionDeposit.id, e.target.value)}
                        className="pl-9"
                        min={0}
                      />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {regionDeposit.currency}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Displayed as: {getCurrencySymbol(regionDeposit.currency)}
                    {(editedDeposit[regionDeposit.id] ?? regionDeposit.amount).toLocaleString()} {regionDeposit.currency}
                  </p>
                </div>

                {editedDeposit[regionDeposit.id] !== undefined && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleSaveDeposit(regionDeposit.id, regionDeposit.amount)}
                    disabled={updateDepositMutation.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                )}

                <p className="text-xs text-muted-foreground">
                  Last updated:{" "}
                  {new Date(regionDeposit.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Category Pricing Range */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Category Pricing Range</h3>
            <div className="grid gap-6 md:grid-cols-3">
              {regionPrices.map((price) => {
                const label = categoryLabels[price.category];
                const currentMin = editedPrices[price.id]?.min ?? price.min_price ?? price.price * 0.8;
                const currentMax = editedPrices[price.id]?.max ?? price.price;
                const hasChange = editedPrices[price.id] !== undefined;

                return (
                  <Card key={price.id} className={hasChange ? "ring-2 ring-primary" : ""}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{label?.title}</CardTitle>
                        <Badge variant="outline" className="capitalize">
                          {price.category}
                        </Badge>
                      </div>
                      <CardDescription>{label?.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Weekly Price Range</label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="number"
                              value={currentMin}
                              onChange={(e) => handlePriceChange(price.id, "min", e.target.value)}
                              className="pl-9"
                              min={0}
                              placeholder="Min"
                            />
                          </div>
                          <span className="text-muted-foreground">to</span>
                          <div className="relative flex-1">
                            <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="number"
                              value={currentMax}
                              onChange={(e) => handlePriceChange(price.id, "max", e.target.value)}
                              className="pl-9"
                              min={0}
                              placeholder="Max"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Displayed as: {getCurrencySymbol(price.currency)}
                          {currentMin.toLocaleString()} to {getCurrencySymbol(price.currency)}
                          {currentMax.toLocaleString()}/week
                        </p>
                      </div>

                      {hasChange && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleSavePrice(price.id, price.min_price ?? price.price * 0.8, price.price)}
                          disabled={updatePriceMutation.isPending}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save
                        </Button>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Last updated:{" "}
                        {new Date(price.updated_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
