'use client';

import { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconDownload, IconFileSpreadsheet, IconTableExport } from '@tabler/icons-react';
import { toast } from 'sonner';
import { exportAcceptedCandidatesAction } from '../actions';
import { cn } from '@/lib/utils';

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

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 10,
      },
    },
  };

  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl mix-blend-multiply animate-blob" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl mix-blend-multiply animate-blob" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl mix-blend-multiply animate-blob" style={{ animationDelay: '4s' }} />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl mix-blend-multiply animate-blob animation-delay-2000" />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl mix-blend-multiply animate-blob animation-delay-4000" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-2xl"
      >
        <motion.div variants={itemVariants} className="text-center mb-10 space-y-2">
          <div className="inline-flex items-center justify-center p-2 mb-4 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20">
            <IconTableExport className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            Export Data
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Generate and download comprehensive reports for HR analysis and record-keeping.
          </p>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden group hover:border-primary/20 transition-colors duration-500">
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row">
                <div className="p-8 md:p-10 flex-1 flex flex-col justify-center space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                      Accepted Candidates
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 font-medium">
                        Live Data
                      </span>
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                      Download a detailed Excel report containing all candidates who have moved to the &ldquo;Accepted&rdquo; stage. Includes contact info, interview scores, and decision history.
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                     <div className="flex items-center gap-1.5">
                       <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                       Ready to export
                     </div>
                     <div className="w-px h-4 bg-border" />
                     <div>.xlsx format</div>
                  </div>

                  <Button
                    size="lg"
                    onClick={handleExport}
                    disabled={loading}
                    className={cn(
                      "w-full sm:w-auto relative overflow-hidden transition-all duration-300",
                      loading ? "opacity-80 cursor-wait" : "hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
                    )}
                  >
                    <div className="relative z-10 flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          <span>Generating Report...</span>
                        </>
                      ) : (
                        <>
                          <IconDownload className="w-4 h-4" />
                          <span>Download Report</span>
                        </>
                      )}
                    </div>
                    {!loading && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
                    )}
                  </Button>
                </div>

                <div className="relative hidden md:flex w-1/3 bg-muted/30 items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
                  <motion.div 
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <div className="w-32 h-32 rounded-2xl bg-white dark:bg-black shadow-2xl flex items-center justify-center border border-border/50 backdrop-blur-sm relative z-10 group-hover:border-primary/50 transition-colors">
                      <IconFileSpreadsheet className="w-16 h-16 text-green-600 dark:text-green-500" strokeWidth={1.5} />
                    </div>
                  </motion.div>
                  
                  {/* Decorative elements behind icon */}
                  <div className="absolute w-24 h-24 bg-green-500/20 rounded-full blur-2xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="mt-8 text-center">
          <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto">
            Sensitive Data Warning: This file contains PII. Ensure compliance with GDPR/CCPA when storing or sharing.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
