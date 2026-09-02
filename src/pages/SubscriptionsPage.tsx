import { useAuth } from "@/contexts/AuthContext";
import { SubscriptionPlansPanel } from "@/components/subscriptions/SubscriptionPlansPanel";
import { Card } from "@/components/ui/card";
import { Navigate } from "react-router-dom";

const SubscriptionsPage = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="container max-w-5xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Subscriptions</h1>
        <p className="text-muted-foreground mt-1">
          Driver Training is mandatory and unlocks Insurance. Roadside Support is optional.
        </p>
      </div>

      <Card className="p-6">
        <SubscriptionPlansPanel title="Driver Training (required)" planTypes={["training"]} />
      </Card>

      <Card className="p-6">
        <SubscriptionPlansPanel title="Insurance" planTypes={["insurance"]} />
      </Card>

      <Card className="p-6">
        <SubscriptionPlansPanel title="Roadside Support" planTypes={["roadside_support"]} />
      </Card>
    </div>
  );
};

export default SubscriptionsPage;
