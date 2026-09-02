import { useState } from "react";
import { useRegionalOperations } from "@/hooks/useRegionalOperations";
import PersonaTemplateManagement from "@/components/admin/PersonaTemplateManagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Globe, MapPin, Building2, Plus, Trash2, Power, PowerOff,
  ChevronRight, Loader2, ToggleLeft, Zap, MessageSquare, Settings2, Phone,
} from "lucide-react";
import { toast } from "sonner";
import type { PlatformRegion } from "@/hooks/useRegionalOperations";

const ForwardingNumbersEditor = ({ 
  region, 
  onUpdate 
}: { 
  region: PlatformRegion; 
  onUpdate: (id: string, updates: { forwarding_sms?: string | null; forwarding_whatsapp?: string | null; forwarding_notes?: string | null }) => Promise<void>;
}) => {
  const [sms, setSms] = useState(region.forwarding_sms || "");
  const [whatsapp, setWhatsapp] = useState(region.forwarding_whatsapp || "");
  const [notes, setNotes] = useState(region.forwarding_notes || "");
  const [dirty, setDirty] = useState(false);

  const handleSave = async () => {
    await onUpdate(region.id, {
      forwarding_sms: sms.trim() || null,
      forwarding_whatsapp: whatsapp.trim() || null,
      forwarding_notes: notes.trim() || null,
    });
    setDirty(false);
  };

  return (
    <div className="mb-3 p-3 rounded border bg-muted/10">
      <h5 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
        <Phone className="h-3.5 w-3.5" /> Message Forwarding Numbers
      </h5>
      <p className="text-[10px] text-muted-foreground mb-2">
        Local numbers that receive copies of all SMS and WhatsApp messages for this region.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">SMS Forwarding</Label>
          <Input 
            placeholder="+1234567890" 
            value={sms} 
            onChange={e => { setSms(e.target.value); setDirty(true); }}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px]">WhatsApp Forwarding</Label>
          <Input 
            placeholder="+1234567890" 
            value={whatsapp} 
            onChange={e => { setWhatsapp(e.target.value); setDirty(true); }}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="mt-2">
        <Label className="text-[10px]">Notes</Label>
        <Input 
          placeholder="e.g., Local SIM provider details" 
          value={notes} 
          onChange={e => { setNotes(e.target.value); setDirty(true); }}
          className="h-8 text-xs"
        />
      </div>
      {dirty && (
        <Button size="sm" className="mt-2 h-7 text-xs gap-1" onClick={handleSave}>
          Save Forwarding
        </Button>
      )}
    </div>
  );
};

const RegionalOperationsManagement = () => {
  const {
    countries, regions, cities, features, overrides,
    isLoading,
    toggleCountry, toggleRegion, toggleCity,
    addCountry, addRegion, addCity,
    deleteCountry, deleteRegion, deleteCity,
    setFeatureOverride, removeFeatureOverride,
    getEffectiveFeatureState,
    updateRegionForwarding,
  } = useRegionalOperations();

  const [addCountryOpen, setAddCountryOpen] = useState(false);
  const [addRegionOpen, setAddRegionOpen] = useState(false);
  const [addCityOpen, setAddCityOpen] = useState(false);
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [selectedRegionId, setSelectedRegionId] = useState<string>("");

  // Form state
  const [newCountry, setNewCountry] = useState({ code: "", name: "", flag: "🌍", currency_code: "", currency_symbol: "", phone_prefix: "", payment_gateway: "paypal", timezone: "UTC" });
  const [newRegion, setNewRegion] = useState({ code: "", name: "", country_id: "" });
  const [newCity, setNewCity] = useState({ name: "", region_id: "" });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "service": return <Zap className="h-4 w-4" />;
      case "feature": return <ToggleLeft className="h-4 w-4" />;
      case "communication": return <MessageSquare className="h-4 w-4" />;
      default: return <Settings2 className="h-4 w-4" />;
    }
  };

  const getFeaturesByCategory = (category: string) => features.filter(f => f.category === category);

  const handleAddCountry = async () => {
    if (!newCountry.code || !newCountry.name || !newCountry.currency_code) {
      toast.error("Please fill in required fields");
      return;
    }
    await addCountry({ ...newCountry, is_active: false, display_order: countries.length + 1 });
    setNewCountry({ code: "", name: "", flag: "🌍", currency_code: "", currency_symbol: "", phone_prefix: "", payment_gateway: "paypal", timezone: "UTC" });
    setAddCountryOpen(false);
  };

  const handleAddRegion = async () => {
    if (!newRegion.code || !newRegion.name || !newRegion.country_id) {
      toast.error("Please fill in required fields");
      return;
    }
    await addRegion({ ...newRegion, is_active: false, display_order: regions.filter(r => r.country_id === newRegion.country_id).length + 1 });
    setNewRegion({ code: "", name: "", country_id: "" });
    setAddRegionOpen(false);
  };

  const handleAddCity = async () => {
    if (!newCity.name || !newCity.region_id) {
      toast.error("Please fill in required fields");
      return;
    }
    await addCity({ ...newCity, is_active: false, display_order: cities.filter(c => c.region_id === newCity.region_id).length + 1 });
    setNewCity({ name: "", region_id: "" });
    setAddCityOpen(false);
  };

  // Build the feature toggle grid for a specific location
  const renderFeatureToggles = (scope: "country" | "region" | "city", locationId: string, countryId?: string, regionId?: string) => {
    const categories = ["service", "feature", "communication"];
    return (
      <div className="space-y-4 mt-4">
        {categories.map(cat => {
          const catFeatures = getFeaturesByCategory(cat);
          if (catFeatures.length === 0) return null;
          return (
            <div key={cat}>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                {getCategoryIcon(cat)}
                {cat === "service" ? "Services" : cat === "feature" ? "Features" : "Communications"}
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {catFeatures.map(feature => {
                  const effective = getEffectiveFeatureState(feature.id, countryId, regionId, scope === "city" ? locationId : undefined);
                  const override = overrides.find(o => 
                    o.feature_id === feature.id &&
                    ((scope === "country" && o.country_id === locationId) ||
                     (scope === "region" && o.region_id === locationId) ||
                     (scope === "city" && o.city_id === locationId))
                  );
                  const isOverridden = !!override;

                  return (
                    <div key={feature.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{feature.name}</p>
                        {isOverridden && (
                          <Badge variant="outline" className="text-[10px] mt-0.5">overridden</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isOverridden && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeFeatureOverride(override!.id)}
                            title="Reset to inherited"
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                        <Switch
                          checked={effective}
                          onCheckedChange={(checked) => {
                            setFeatureOverride(feature.id, scope, locationId, checked);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Globe className="h-6 w-6 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Regional Operations Management</h3>
              <p className="text-sm text-muted-foreground">
                Master switches to control services, features, and communications by country, region, and city.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{countries.length} Countries</Badge>
            <Badge variant="secondary">{regions.length} Regions</Badge>
            <Badge variant="secondary">{cities.length} Cities</Badge>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{countries.filter(c => c.is_active).length}</p>
          <p className="text-xs text-muted-foreground">Active Countries</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{regions.filter(r => r.is_active).length}</p>
          <p className="text-xs text-muted-foreground">Active Regions</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{cities.filter(c => c.is_active).length}</p>
          <p className="text-xs text-muted-foreground">Active Cities</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{overrides.length}</p>
          <p className="text-xs text-muted-foreground">Feature Overrides</p>
        </Card>
      </div>

      <Tabs defaultValue="locations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="locations">Locations & Switches</TabsTrigger>
          <TabsTrigger value="features">Global Features</TabsTrigger>
        </TabsList>

        {/* ─── LOCATIONS TAB ─── */}
        <TabsContent value="locations" className="space-y-4">
          {/* Add Country */}
          <div className="flex justify-end">
            <Dialog open={addCountryOpen} onOpenChange={setAddCountryOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Country</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add New Country</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Country Code *</Label><Input placeholder="US" value={newCountry.code} onChange={e => setNewCountry(p => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
                  <div><Label>Name *</Label><Input placeholder="United States" value={newCountry.name} onChange={e => setNewCountry(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><Label>Flag Emoji</Label><Input placeholder="🇺🇸" value={newCountry.flag} onChange={e => setNewCountry(p => ({ ...p, flag: e.target.value }))} /></div>
                  <div><Label>Currency Code *</Label><Input placeholder="USD" value={newCountry.currency_code} onChange={e => setNewCountry(p => ({ ...p, currency_code: e.target.value.toUpperCase() }))} /></div>
                  <div><Label>Currency Symbol</Label><Input placeholder="$" value={newCountry.currency_symbol} onChange={e => setNewCountry(p => ({ ...p, currency_symbol: e.target.value }))} /></div>
                  <div><Label>Phone Prefix</Label><Input placeholder="+1" value={newCountry.phone_prefix} onChange={e => setNewCountry(p => ({ ...p, phone_prefix: e.target.value }))} /></div>
                  <div>
                    <Label>Payment Gateway</Label>
                    <Select value={newCountry.payment_gateway} onValueChange={v => setNewCountry(p => ({ ...p, payment_gateway: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paypal">PayPal</SelectItem>
                        <SelectItem value="paystack">Paystack</SelectItem>
                        <SelectItem value="stripe">Stripe</SelectItem>
                        <SelectItem value="flutterwave">Flutterwave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Timezone</Label><Input placeholder="UTC" value={newCountry.timezone} onChange={e => setNewCountry(p => ({ ...p, timezone: e.target.value }))} /></div>
                </div>
                <Button onClick={handleAddCountry} className="w-full mt-2">Add Country</Button>
              </DialogContent>
            </Dialog>
          </div>

          {/* Country Accordion */}
          <Accordion type="multiple" className="space-y-3">
            {countries.map(country => {
              const countryRegions = regions.filter(r => r.country_id === country.id);
              return (
                <AccordionItem key={country.id} value={country.id} className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl">{country.flag}</span>
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{country.name}</span>
                          <Badge variant="outline" className="text-xs">{country.code}</Badge>
                          <Badge variant="outline" className="text-xs">{country.currency_code}</Badge>
                          <Badge variant="outline" className="text-xs">{country.payment_gateway}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {countryRegions.length} regions • {cities.filter(c => countryRegions.some(r => r.id === c.region_id)).length} cities
                        </p>
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Switch
                          checked={country.is_active}
                          onCheckedChange={checked => toggleCountry(country.id, checked)}
                        />
                        {country.is_active ? (
                          <Power className="h-4 w-4 text-primary" />
                        ) : (
                          <PowerOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {/* Country-level feature toggles */}
                    <div className="mb-4 p-3 rounded-lg bg-muted/30 border">
                      <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                        <Globe className="h-4 w-4" /> Country-Level Feature Switches
                      </h4>
                      <p className="text-xs text-muted-foreground mb-2">These apply to all regions and cities in {country.name} unless overridden.</p>
                      {renderFeatureToggles("country", country.id, country.id)}
                    </div>

                    {/* Regions */}
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Regions</h4>
                      <Dialog open={addRegionOpen && selectedCountryId === country.id} onOpenChange={open => { setAddRegionOpen(open); setSelectedCountryId(country.id); }}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"><Plus className="h-3 w-3" /> Add Region</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Add Region to {country.name}</DialogTitle></DialogHeader>
                          <div className="space-y-3">
                            <div><Label>Region Code *</Label><Input placeholder="ny" value={newRegion.code} onChange={e => setNewRegion(p => ({ ...p, code: e.target.value.toLowerCase(), country_id: country.id }))} /></div>
                            <div><Label>Name *</Label><Input placeholder="New York" value={newRegion.name} onChange={e => setNewRegion(p => ({ ...p, name: e.target.value, country_id: country.id }))} /></div>
                          </div>
                          <Button onClick={handleAddRegion} className="w-full mt-2">Add Region</Button>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <Accordion type="multiple" className="space-y-2">
                      {countryRegions.map(region => {
                        const regionCities = cities.filter(c => c.region_id === region.id);
                        return (
                          <AccordionItem key={region.id} value={region.id} className="border rounded-md overflow-hidden ml-4">
                            <AccordionTrigger className="px-3 py-2 hover:no-underline text-sm">
                              <div className="flex items-center gap-2 flex-1">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{region.name}</span>
                                <Badge variant="outline" className="text-[10px]">{region.code}</Badge>
                                {region.requires_police_report && <Badge variant="secondary" className="text-[10px]">Police Report Required</Badge>}
                                <span className="text-xs text-muted-foreground ml-auto mr-2">{regionCities.length} cities</span>
                                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                  <Switch
                                    checked={region.is_active}
                                    onCheckedChange={checked => toggleRegion(region.id, checked)}
                                  />
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteRegion(region.id)}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3">
                              {/* Message Forwarding Numbers */}
                              <ForwardingNumbersEditor region={region} onUpdate={updateRegionForwarding} />

                              {/* Region-level feature toggles */}
                              <div className="mb-3 p-2 rounded bg-muted/20 border">
                                <h5 className="text-xs font-semibold mb-1">Region-Level Overrides</h5>
                                {renderFeatureToggles("region", region.id, country.id, region.id)}
                              </div>

                              {/* Cities */}
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-xs font-semibold flex items-center gap-1"><Building2 className="h-3 w-3" /> Cities</h5>
                                <Dialog open={addCityOpen && selectedRegionId === region.id} onOpenChange={open => { setAddCityOpen(open); setSelectedRegionId(region.id); }}>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="ghost" className="gap-1 h-6 text-[10px]"><Plus className="h-3 w-3" /> Add City</Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader><DialogTitle>Add City to {region.name}</DialogTitle></DialogHeader>
                                    <div><Label>City Name *</Label><Input placeholder="City name" value={newCity.name} onChange={e => setNewCity({ name: e.target.value, region_id: region.id })} /></div>
                                    <Button onClick={handleAddCity} className="w-full mt-2">Add City</Button>
                                  </DialogContent>
                                </Dialog>
                              </div>

                              <div className="space-y-2 ml-2">
                                {regionCities.map(city => (
                                  <Accordion key={city.id} type="single" collapsible>
                                    <AccordionItem value={city.id} className="border rounded overflow-hidden">
                                      <AccordionTrigger className="px-2 py-1.5 hover:no-underline text-xs">
                                        <div className="flex items-center gap-2 flex-1">
                                          <Building2 className="h-3 w-3 text-muted-foreground" />
                                          <span className="font-medium">{city.name}</span>
                                          {city.search_radius_miles && (
                                            <span className="text-[10px] text-muted-foreground">{city.search_radius_miles}mi radius</span>
                                          )}
                                          <div className="flex items-center gap-1.5 ml-auto" onClick={e => e.stopPropagation()}>
                                            <Switch
                                              checked={city.is_active}
                                              onCheckedChange={checked => toggleCity(city.id, checked)}
                                            />
                                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteCity(city.id)}>
                                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                                            </Button>
                                          </div>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent className="px-2 pb-2">
                                        <div className="p-2 rounded bg-muted/10 border">
                                          <h6 className="text-[10px] font-semibold mb-1">City-Level Overrides</h6>
                                          {renderFeatureToggles("city", city.id, country.id, region.id)}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  </Accordion>
                                ))}
                                {regionCities.length === 0 && (
                                  <p className="text-xs text-muted-foreground italic">No cities configured</p>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>

                    {/* Delete country */}
                    <div className="mt-4 pt-3 border-t flex justify-end">
                      <Button variant="destructive" size="sm" className="gap-1" onClick={() => deleteCountry(country.id)}>
                        <Trash2 className="h-3 w-3" /> Remove Country
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </TabsContent>

        {/* ─── GLOBAL FEATURES TAB ─── */}
        <TabsContent value="features" className="space-y-4">
          <Card className="p-6">
            <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Platform Feature Definitions
            </h4>
            <p className="text-xs text-muted-foreground mb-4">
              These are the available features that can be toggled per location. The "Global Default" indicates whether a feature is ON or OFF by default when no override exists.
            </p>

            {["service", "feature", "communication"].map(cat => (
              <div key={cat} className="mb-6">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  {getCategoryIcon(cat)}
                  {cat === "service" ? "Core Services" : cat === "feature" ? "Platform Features" : "Communication Channels"}
                </h5>
                <div className="space-y-1">
                  {getFeaturesByCategory(cat).map(feature => (
                    <div key={feature.id} className="flex items-center justify-between p-3 rounded-md border bg-card hover:bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{feature.name}</p>
                        {feature.description && <p className="text-xs text-muted-foreground">{feature.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={feature.is_global_default ? "default" : "secondary"}>
                          {feature.is_global_default ? "ON by default" : "OFF by default"}
                        </Badge>
                        {overrides.filter(o => o.feature_id === feature.id).length > 0 && (
                          <Badge variant="outline">{overrides.filter(o => o.feature_id === feature.id).length} overrides</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          {/* Inheritance info */}
          <Card className="p-4">
            <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <ChevronRight className="h-4 w-4" /> Feature Inheritance Rules
            </h5>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <strong>City override</strong> takes highest priority</li>
              <li>• <strong>Region override</strong> applies to all cities in that region (unless city has its own override)</li>
              <li>• <strong>Country override</strong> applies to all regions and cities (unless overridden below)</li>
              <li>• <strong>Global default</strong> applies when no override exists at any level</li>
              <li>• Use the <Trash2 className="h-3 w-3 inline" /> button next to a toggle to reset it to the inherited value</li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>

      <PersonaTemplateManagement />
    </div>
  );
};

export default RegionalOperationsManagement;
