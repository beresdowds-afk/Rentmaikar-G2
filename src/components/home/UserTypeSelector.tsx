import { User, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserType, UserType } from "@/contexts/UserTypeContext";
import { useRegion } from "@/contexts/RegionContext";

const UserTypeSelector = () => {
  const { userType, setUserType } = useUserType();
  const { country } = useRegion();

  const content = {
    USA: {
      title: "I want to...",
      driver: "Drive & Earn",
      driverDesc: "Find a car to rent",
      owner: "List My Car",
      ownerDesc: "Earn from my vehicle",
    },
    Nigeria: {
      title: "I want to...",
      driver: "Drive & Earn",
      driverDesc: "Find a car to rent",
      owner: "List My Car",
      ownerDesc: "Earn from my vehicle",
    },
  };

  const c = content[country];

  const handleSelect = (type: UserType) => {
    setUserType(type);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg py-3 px-4 animate-slide-up">
      <div className="container mx-auto">
        <p className="text-center text-sm text-muted-foreground mb-3">{c.title}</p>
        <div className="flex justify-center gap-3">
          <Button
            variant={userType === "driver" ? "hero" : "outline"}
            size="lg"
            className="gap-2 min-w-[140px]"
            onClick={() => handleSelect("driver")}
          >
            <User className="w-4 h-4" />
            <span className="flex flex-col items-start">
              <span className="font-semibold">{c.driver}</span>
              <span className="text-xs opacity-70">{c.driverDesc}</span>
            </span>
          </Button>
          <Button
            variant={userType === "owner" ? "hero" : "outline"}
            size="lg"
            className="gap-2 min-w-[140px]"
            onClick={() => handleSelect("owner")}
          >
            <Car className="w-4 h-4" />
            <span className="flex flex-col items-start">
              <span className="font-semibold">{c.owner}</span>
              <span className="text-xs opacity-70">{c.ownerDesc}</span>
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserTypeSelector;
