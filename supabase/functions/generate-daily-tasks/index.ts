import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";
import { isCallerAdmin } from "../_shared/admin-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Allow: (1) cron via x-cron-secret or service-role bearer, OR (2) authenticated admin user.
  const cronDenied = await requireCronSecretAsync(req);
  if (cronDenied) {
    const isAdmin = await isCallerAdmin(req);
    if (!isAdmin) return cronDenied;
  }



  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().split("T")[0];

    // Check if tasks already generated today
    const { count } = await supabase
      .from("admin_daily_tasks")
      .select("*", { count: "exact", head: true })
      .eq("task_date", today);

    if ((count ?? 0) > 0) {
      return new Response(
        JSON.stringify({ message: "Tasks already generated for today", count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tasks: Array<{
      task_date: string;
      category: string;
      title: string;
      description: string;
      priority: string;
      source_table?: string;
    }> = [];

    // 1. Pending Applications
    const { count: pendingApps } = await supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if ((pendingApps ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "applications",
        title: `Review ${pendingApps} pending application(s)`,
        description: "New driver/owner applications awaiting review and approval.",
        priority: pendingApps! > 5 ? "high" : "medium",
        source_table: "applications",
      });
    }

    // 2. Payment Defaults
    const { count: activeDefaults } = await supabase
      .from("payment_defaults")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    if ((activeDefaults ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "payment_defaults",
        title: `Address ${activeDefaults} active payment default(s)`,
        description: "Drivers with overdue payments requiring attention or deactivation review.",
        priority: "urgent",
        source_table: "payment_defaults",
      });
    }

    // 3. Expiring Documents (next 7 days)
    const sevenDaysOut = new Date();
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const { count: expiringDocs } = await supabase
      .from("user_documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("expiry_date", sevenDaysOut.toISOString().split("T")[0])
      .gte("expiry_date", today);

    if ((expiringDocs ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "expiring_documents",
        title: `${expiringDocs} document(s) expiring within 7 days`,
        description: "Driver/owner documents expiring soon — notify affected users.",
        priority: "high",
        source_table: "user_documents",
      });
    }

    // 4. Pending Price Negotiations
    const { count: pendingNeg } = await supabase
      .from("price_negotiations")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if ((pendingNeg ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "pending_negotiations",
        title: `Respond to ${pendingNeg} pending price negotiation(s)`,
        description: "Drivers/owners awaiting a response on their pricing requests.",
        priority: "medium",
        source_table: "price_negotiations",
      });
    }

    // 5. Open Support Tasks
    const { count: openTasks } = await supabase
      .from("support_tasks")
      .select("*", { count: "exact", head: true })
      .is("resolved_at", null);

    if ((openTasks ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "support_tasks",
        title: `${openTasks} open support task(s) pending`,
        description: "Unresolved support tasks across legal, IoT, and vehicle categories.",
        priority: openTasks! > 10 ? "high" : "medium",
        source_table: "support_tasks",
      });
    }

    // 6. Unread Inbox Messages
    const { count: openConvos } = await supabase
      .from("inbox_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");

    if ((openConvos ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "inbox",
        title: `${openConvos} open inbox conversation(s)`,
        description: "Customer inquiries via email, SMS, or WhatsApp awaiting response.",
        priority: openConvos! > 5 ? "high" : "medium",
        source_table: "inbox_conversations",
      });
    }

    // 7. Pending Vehicle Recalls
    const { count: pendingRecalls } = await supabase
      .from("vehicle_recalls")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if ((pendingRecalls ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "recalls",
        title: `${pendingRecalls} vehicle recall(s) pending action`,
        description: "Vehicles flagged for recall due to IoT failure or safety concerns.",
        priority: "urgent",
        source_table: "vehicle_recalls",
      });
    }

    // 8. Pending Rent-to-Own Listings
    const { count: pendingRTO } = await supabase
      .from("rent_to_own_listings")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if ((pendingRTO ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "rent_to_own",
        title: `Review ${pendingRTO} pending rent-to-own listing(s)`,
        description: "Owner rent-to-own proposals awaiting admin approval or counter-offer.",
        priority: "medium",
        source_table: "rent_to_own_listings",
      });
    }

    // 9. Unsigned Legal Agreements
    const { count: unsignedAgreements } = await supabase
      .from("legal_agreements")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if ((unsignedAgreements ?? 0) > 0) {
      tasks.push({
        task_date: today,
        category: "legal_agreements",
        title: `${unsignedAgreements} legal agreement(s) awaiting signatures`,
        description: "Agreements pending driver, owner, or admin witness signatures.",
        priority: "medium",
        source_table: "legal_agreements",
      });
    }

    // Always add a daily check-in task
    tasks.push({
      task_date: today,
      category: "custom",
      title: "Daily platform health check",
      description: "Review dashboard metrics, verify cron jobs ran successfully, and check system alerts.",
      priority: "low",
    });

    // Insert all tasks
    if (tasks.length > 0) {
      const { error } = await supabase.from("admin_daily_tasks").insert(tasks);
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ message: `Generated ${tasks.length} tasks for ${today}`, tasks: tasks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating daily tasks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
