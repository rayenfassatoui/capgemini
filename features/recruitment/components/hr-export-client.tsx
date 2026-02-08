'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IconDownload, IconFileSpreadsheet } from '@tabler/icons-react';
import { toast } from 'sonner';
import { exportAcceptedCandidatesAction } from '../actions';

export function HRExportClient() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const base64 = await exportAcceptedCandidatesAction();
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accepted-candidates-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export candidates');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <Card>
        <CardHeader>
          <CardTitle>Export Accepted Candidates</CardTitle>
          <CardDescription>
            Download a comprehensive Excel report of all candidates who have been accepted by HR.
            The report includes candidate details, interview scores, and decision history.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-10 space-y-6">
          <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
            <IconFileSpreadsheet className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
          
          <div className="text-center max-w-md text-muted-foreground">
            <p>
              This export includes sensitive candidate data. Please handle the downloaded file with care and in accordance with data privacy regulations.
            </p>
          </div>

          <Button 
            size="lg" 
            onClick={handleExport} 
            disabled={loading}
            className="w-full max-w-sm"
          >
            {loading ? (
              <>Running Export...</>
            ) : (
              <>
                <IconDownload className="mr-2 h-4 w-4" />
                Export to Excel
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
