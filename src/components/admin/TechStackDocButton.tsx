import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateTechStackPDF } from '@/lib/generate-tech-stack-pdf';
import { toast } from 'sonner';

export const TechStackDocButton = () => {
  const handleGeneratePDF = () => {
    try {
      generateTechStackPDF();
      toast.success('Tech stack documentation downloaded successfully');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF documentation');
    }
  };

  return (
    <Button onClick={handleGeneratePDF} variant="outline" className="gap-2">
      <FileText className="h-4 w-4" />
      Download Tech Stack PDF
      <Download className="h-4 w-4" />
    </Button>
  );
};
