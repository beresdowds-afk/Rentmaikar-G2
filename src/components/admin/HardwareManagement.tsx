import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeviceRegistry } from './hardware/DeviceRegistry';
import { DeviceLinking } from './hardware/DeviceLinking';
import { DeviceActivation } from './hardware/DeviceActivation';
import { DeviceHealth } from './hardware/DeviceHealth';
import { IoTSimCardsPanel } from './IoTSimCardsPanel';
import GPSANDTRACKDashboard from './GPSANDTRACKDashboard';
import { Cpu, Link, Power, Activity, Satellite, CreditCard as SimIcon } from 'lucide-react';

export const HardwareManagement = () => {
  const [activeTab, setActiveTab] = useState('registry');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Hardware & IoT Management Portal</h2>
        <p className="text-muted-foreground">
          Register, link, and manage IoT GPS tracking devices and cellular SIM cards for your fleet
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="registry" className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Device Registry
          </TabsTrigger>
          <TabsTrigger value="sims" className="flex items-center gap-2">
            <SimIcon className="h-4 w-4" />
            SIM Provisioning
          </TabsTrigger>
          <TabsTrigger value="linking" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Vehicle Linking
          </TabsTrigger>
          <TabsTrigger value="activation" className="flex items-center gap-2">
            <Power className="h-4 w-4" />
            Activation
          </TabsTrigger>
          <TabsTrigger value="sarekon" className="flex items-center gap-2">
            <Satellite className="h-4 w-4" />
            GPSANDTRACK
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Health Monitor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry">
          <DeviceRegistry />
        </TabsContent>

        <TabsContent value="sims">
          <IoTSimCardsPanel />
        </TabsContent>

        <TabsContent value="linking">
          <DeviceLinking />
        </TabsContent>

        <TabsContent value="activation">
          <DeviceActivation />
        </TabsContent>

        <TabsContent value="sarekon">
          <GPSANDTRACKDashboard />
        </TabsContent>

        <TabsContent value="health">
          <DeviceHealth />
        </TabsContent>
      </Tabs>
    </div>
  );
};
