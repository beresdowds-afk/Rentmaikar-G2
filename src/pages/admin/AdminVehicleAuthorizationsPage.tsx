import React from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { VehicleAuthorizationLogManagement } from '@/components/admin/VehicleAuthorizationLogManagement';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  embedded?: boolean;
}

export default function AdminVehicleAuthorizationsPage({ embedded = false }: Props) {
  if (embedded) {
    return <VehicleAuthorizationLogManagement />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Admin Dashboard
            </Link>
          </Button>
        </div>
        <VehicleAuthorizationLogManagement />
      </main>
      <Footer />
    </div>
  );
}
