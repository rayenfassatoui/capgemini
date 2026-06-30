'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconUpload,
  IconTrash,
  IconFileText,
  IconLoader2,
  IconSearch,
  IconDownload,
  IconFileSpreadsheet,
  IconEye,
  IconCode,
  IconLanguage,
  IconBrain,
  IconChecklist,
  IconMessageChatbot,
} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { deleteCvAction, exportSingleCvExcelAction, exportMultipleCvsZipAction, getCvDetailsAction, getCvFileAction } from '../actions';
import { useUploadQueue } from './upload-provider';
import { buildAgentPromptHref, type AgentReference } from './chat/agent-prompts';
import { EvidenceReadinessPanel } from './evidence-readiness-panel';
import {
  buildCvEvidenceReadiness,
} from './evidence-readiness';
import type { CvPoolStats } from '../types';


// Define the CV type based on what we expect from the server
interface CvRecord {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  extractedName: string | null;
  extractedEmail: string | null;
  extractedSkills: string[] | null;
  createdAt: Date;
  extractedPhone?: string | null;
  extractedExperiences?: Array<Record<string, string>> | null;
  extractedEducation?: Array<Record<string, string>> | null;
  extractedLanguages?: string[] | null;
  extractedSummary?: string | null;
}

interface CvFullDetails {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  extractedName: string | null;
  extractedEmail: string | null;
  extractedPhone: string | null;
  extractedSkills: string[] | null;
  extractedExperiences: Array<Record<string, string>> | null;
  extractedEducation: Array<Record<string, string>> | null;
  extractedLanguages: string[] | null;
  extractedSummary: string | null;
  createdAt: Date;
}

interface CvPoolClientProps {
  initialData: CvRecord[];
  stats: CvPoolStats;
  initialReviewCvId: string | null;
}

export function CvPoolClient({
  initialData,
  stats,
  initialReviewCvId,
}: CvPoolClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global background upload queue
  const { enqueueFiles } = useUploadQueue();

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Review dialog state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState<CvFullDetails | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [requestedReviewId, setRequestedReviewId] = useState<string | null>(
    initialReviewCvId,
  );

  // Filter CVs based on search query
  const filteredCvs = initialData.filter((cv) => {
    const query = searchQuery.toLowerCase();
    return (
      cv.filename.toLowerCase().includes(query) ||
      cv.extractedName?.toLowerCase().includes(query) ||
      cv.extractedEmail?.toLowerCase().includes(query) ||
      cv.extractedSkills?.some((skill) => skill.toLowerCase().includes(query))
    );
  });

  const handleFilesSelected = (files: FileList | File[]) => {
    enqueueFiles(files);
    setIsUploadOpen(false);
    toast.info(
      `${Array.from(files).length} file${Array.from(files).length > 1 ? 's' : ''} queued. Processing in background.`
    );
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const toggleSelect = (cvId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cvId)) {
        next.delete(cvId);
      } else {
        next.add(cvId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCvs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCvs.map((cv) => cv.id)));
    }
  };

  const handleDelete = async (cvId: string) => {
    if (!confirm('Are you sure you want to delete this CV?')) return;

    try {
      await deleteCvAction(cvId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(cvId);
        return next;
      });
      toast.success('CV deleted');
      router.refresh();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete CV');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Are you sure you want to delete ${selectedIds.size} selected CV${selectedIds.size > 1 ? 's' : ''}?`
      )
    )
      return;

    setIsBulkDeleting(true);

    const deletePromises = Array.from(selectedIds).map((cvId) =>
      deleteCvAction(cvId)
        .then(() => ({ cvId, success: true }))
        .catch((err) => ({ cvId, success: false, error: err }))
    );

    const results = await Promise.allSettled(deletePromises);

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success
    );
    const failed = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
    );

    setSelectedIds(new Set());
    setIsBulkDeleting(false);
    router.refresh();

    if (failed.length === 0) {
      toast.success(`${succeeded.length} CV${succeeded.length > 1 ? 's' : ''} deleted successfully.`);
    } else if (succeeded.length === 0) {
      toast.error(`All ${failed.length} delete${failed.length > 1 ? 's' : ''} failed.`);
    } else {
      toast.warning(
        `${succeeded.length} deleted, ${failed.length} failed. Check console for details.`
      );
      console.warn('Failed CV deletions:', failed);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const allIds = initialData.map((cv) => cv.id);
      const base64 = await exportMultipleCvsZipAction(allIds);
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cv-pool-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CV Pool exported as ZIP');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export CV Pool');
    } finally {
      setIsExporting(false);
    }
  };

  const updateReviewQuery = useCallback(
    (cvId: string | null) => {
      router.replace(cvId ? `${pathname}?reviewCvId=${cvId}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );


  const handleViewCv = useCallback(async (cvId: string) => {
    setIsLoadingReview(true);
    setReviewOpen(true);
    try {
      const details = await getCvDetailsAction(cvId);
      setReviewData(details as CvFullDetails);
    } catch (error) {
      console.error('Review error:', error);
      toast.error('Failed to load CV details');
      setReviewOpen(false);
      setRequestedReviewId(null);
      updateReviewQuery(null);
    } finally {
      setIsLoadingReview(false);
    }
  }, [updateReviewQuery]);

  useEffect(() => {
    if (!requestedReviewId) return;
    if (reviewData?.id === requestedReviewId || isLoadingReview) return;
    void handleViewCv(requestedReviewId);
  }, [handleViewCv, isLoadingReview, requestedReviewId, reviewData?.id]);

  const handleOpenReview = useCallback(
    (cvId: string) => {
      setRequestedReviewId(cvId);
      updateReviewQuery(cvId);
      void handleViewCv(cvId);
    },
    [handleViewCv, updateReviewQuery],
  );

  const handleReviewDialogChange = useCallback(
    (open: boolean) => {
      setReviewOpen(open);
      if (!open) {
        setReviewData(null);
        setRequestedReviewId(null);
        updateReviewQuery(null);
      }
    },
    [updateReviewQuery],
  );

  const handleDownloadCv = async (cvId: string, filename: string) => {
    try {
      const file = await getCvFileAction(cvId);
      if (!file || !file.rawBytes) {
        toast.error('CV file not available for download');
        return;
      }
      const byteCharacters = atob(file.rawBytes);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: file.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download CV');
    }
  };

  const downloadBase64Excel = (base64: string, filename: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingleExcel = async (cvId: string, candidateName: string) => {
    try {
      const base64 = await exportSingleCvExcelAction(cvId);
      const safeName = (candidateName || 'candidate').replace(/[^a-zA-Z0-9]/g, '_');
      downloadBase64Excel(base64, `${safeName}_CV.xlsx`);
      toast.success('Excel CV downloaded');
    } catch (error) {
      console.error('Single Excel export error:', error);
      toast.error('Failed to export CV to Excel');
    }
  };

  const [isBulkExporting, setIsBulkExporting] = useState(false);

  const handleBulkDownloadExcel = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkExporting(true);
    try {
      const base64 = await exportMultipleCvsZipAction(Array.from(selectedIds));
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cvs-export-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${selectedIds.size} CV(s) exported as ZIP`);
    } catch (error) {
      console.error('Bulk ZIP export error:', error);
      toast.error('Failed to export selected CVs');
    } finally {
      setIsBulkExporting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatReferenceDate = (value: Date) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  };

  const formatStructuredCvEntry = (
    entries: Array<Record<string, string>> | null | undefined,
  ) => {
    const firstEntry = entries?.[0];
    if (!firstEntry) return null;

    const values = Object.values(firstEntry)
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length === 0) return null;

    return values.slice(0, 3).join(' · ').slice(0, 160);
  };

  const buildCvAgentReference = (
    cv: Pick<CvRecord, 'id' | 'filename' | 'contentType' | 'size' | 'extractedName' | 'extractedEmail' | 'extractedSkills' | 'createdAt'> &
      Partial<Pick<CvFullDetails, 'extractedPhone' | 'extractedExperiences' | 'extractedEducation' | 'extractedLanguages' | 'extractedSummary'>>,
  ): AgentReference => {
    const candidateName = cv.extractedName || cv.filename;
    const uploadedAt = formatReferenceDate(cv.createdAt);
    const latestExperience = formatStructuredCvEntry(cv.extractedExperiences);
    const latestEducation = formatStructuredCvEntry(cv.extractedEducation);
    const facts: AgentReference['facts'] = [
      ...(cv.extractedEmail ? [{ label: 'Email', value: cv.extractedEmail }] : []),
      ...(cv.extractedPhone ? [{ label: 'Phone', value: cv.extractedPhone }] : []),
      ...(cv.extractedSkills && cv.extractedSkills.length > 0
        ? [{ label: 'Skills', value: cv.extractedSkills.slice(0, 6).join(', ') }]
        : []),
      ...(cv.extractedLanguages && cv.extractedLanguages.length > 0
        ? [{ label: 'Languages', value: cv.extractedLanguages.slice(0, 4).join(', ') }]
        : []),
      ...(latestExperience
        ? [{ label: 'Latest experience', value: latestExperience }]
        : cv.extractedExperiences && cv.extractedExperiences.length > 0
          ? [{ label: 'Experience entries', value: String(cv.extractedExperiences.length) }]
          : []),
      ...(latestEducation
        ? [{ label: 'Education', value: latestEducation }]
        : cv.extractedEducation && cv.extractedEducation.length > 0
          ? [{ label: 'Education entries', value: String(cv.extractedEducation.length) }]
          : []),
      ...(cv.extractedSummary ? [{ label: 'Summary', value: cv.extractedSummary.slice(0, 160) }] : []),
      { label: 'File', value: cv.filename },
      { label: 'File type', value: cv.contentType },
      { label: 'Size', value: formatFileSize(cv.size) },
      ...(uploadedAt ? [{ label: 'Uploaded', value: uploadedAt }] : []),
    ];

    return {
      type: 'cv',
      id: cv.id,
      title: candidateName,
      subtitle: cv.extractedEmail ?? cv.filename,
      href: `/ta/cv-pool?reviewCvId=${cv.id}`,
      ...(facts.length > 0 ? { facts } : {}),
    };
  };

  const poolAgentPrompt = `Analyze the current CV pool. Total CVs: ${stats.totalCvs}. Top extracted skills: ${stats.topSkills.slice(0, 8).map((item) => `${item.skill} (${item.count})`).join(', ') || 'none yet'}. Language distribution: ${stats.languageDistribution.map((item) => `${item.language} (${item.count})`).join(', ') || 'none yet'}. Recommend which profiles to review first, where skill coverage is strong, and which gaps matter for upcoming job matching.`;
  const reviewReadiness = reviewData
    ? buildCvEvidenceReadiness({
        filename: reviewData.filename,
        extractedName: reviewData.extractedName,
        extractedEmail: reviewData.extractedEmail,
        extractedPhone: reviewData.extractedPhone,
        extractedSkills: reviewData.extractedSkills,
        extractedExperiences: reviewData.extractedExperiences,
        extractedEducation: reviewData.extractedEducation,
        extractedLanguages: reviewData.extractedLanguages,
        extractedSummary: reviewData.extractedSummary,
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total CVs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCvs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <IconCode className="size-4" />
              Top Skills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {stats.topSkills.slice(0, 5).map((item) => (
                <div key={item.skill} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate">{item.skill}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{item.count}</span>
                    </div>
                    <Progress
                      value={stats.topSkills[0] ? (item.count / stats.topSkills[0].count) * 100 : 0}
                      className="h-1"
                    />
                  </div>
                </div>
              ))}
              {stats.topSkills.length === 0 && (
                <p className="text-xs text-muted-foreground">No skills extracted yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <IconLanguage className="size-4" />
              Languages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {stats.languageDistribution.map((item) => (
                <Badge key={item.language} variant="outline" className="text-xs">
                  {item.language} ({item.count})
                </Badge>
              ))}
              {stats.languageDistribution.length === 0 && (
                <p className="text-xs text-muted-foreground">No languages extracted yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 bg-card/75 backdrop-blur">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <IconMessageChatbot className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">AI actions for this CV pool</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Use the agent to prioritize profiles, explain skill coverage, or
                prepare interview questions from extracted CV data.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href={buildAgentPromptHref(poolAgentPrompt)}>
              <Button variant="outline" className="w-full rounded-full sm:w-auto">
                <IconBrain className="mr-2 h-4 w-4" />
                Analyze Pool with Agent
              </Button>
            </Link>
            <Link href={buildAgentPromptHref('Review the latest uploaded CVs and recommend which candidates should be matched first to open job requirements. Include rationale, missing evidence, and next TA actions.')}>
              <Button className="w-full rounded-full sm:w-auto">
                <IconChecklist className="mr-2 h-4 w-4" />
                Prioritize with Agent
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full flex-1 sm:max-w-sm">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="cv-pool-search"
            placeholder="Search CVs..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || initialData.length === 0}
          >
            <IconFileSpreadsheet className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export ZIP'}
          </Button>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger render={<Button id="cv-pool-upload-trigger" className="h-10 px-4 py-2" />}>
              <IconUpload className="mr-2 h-4 w-4" />
              Upload CVs
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Resumes</DialogTitle>
                <DialogDescription>
                  Select PDF or DOCX files. They will be processed in the background with AI extraction.
                </DialogDescription>
              </DialogHeader>

              {/* Drop Zone */}
              <div
                className={`
                  mt-2 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors
                  ${
                    dragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }
                `}
                onDragEnter={onDrag}
                onDragLeave={onDrag}
                onDragOver={onDrag}
                onDrop={onDrop}
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <IconUpload className="h-8 w-8 text-primary" />
                  </div>
                  <div className="mt-2">
                    <p className="text-sm font-medium">
                      Drag & drop or click to upload
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOCX up to 5MB each
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx"
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFilesSelected(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select Files
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDownloadExcel}
            disabled={isBulkExporting}
          >
            {isBulkExporting ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconFileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            {isBulkExporting ? 'Exporting...' : 'Download ZIP'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
          >
            {isBulkDeleting ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconTrash className="mr-2 h-4 w-4" />
            )}
            {isBulkDeleting
              ? 'Deleting...'
              : `Delete ${selectedIds.size} CV${selectedIds.size > 1 ? 's' : ''}`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
            disabled={isBulkDeleting}
          >
            Cancel
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="px-6 py-4">
          <CardTitle>All Candidates</CardTitle>
          <CardDescription>
            Manage your talent pool and view parsed candidate details.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] pl-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
                    checked={
                      filteredCvs.length > 0 &&
                      selectedIds.size === filteredCvs.length
                    }
                    onChange={toggleSelectAll}
                    aria-label="Select all candidates"
                  />
                </TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>File Info</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[160px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCvs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No CVs found. Upload one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCvs.map((cv) => (
                  <TableRow
                    key={cv.id}
                    data-state={selectedIds.has(cv.id) ? 'selected' : undefined}
                    className={selectedIds.has(cv.id) ? 'bg-muted/50' : ''}
                  >
                    <TableCell className="pl-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
                        checked={selectedIds.has(cv.id)}
                        onChange={() => toggleSelect(cv.id)}
                        aria-label={`Select ${cv.extractedName || cv.filename}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {cv.extractedName || 'Unknown Candidate'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {cv.extractedEmail || 'No email found'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {cv.extractedSkills?.slice(0, 3).map((skill, idx) => (
                          <Badge
                            key={`${skill}-${idx}`}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {skill}
                          </Badge>
                        ))}
                        {(cv.extractedSkills?.length || 0) > 3 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{(cv.extractedSkills?.length || 0) - 3}
                          </Badge>
                        )}
                        {(!cv.extractedSkills ||
                          cv.extractedSkills.length === 0) && (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <IconFileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="truncate max-w-[150px] text-xs font-medium">
                            {cv.filename}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatFileSize(cv.size)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(cv.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link
                          href={buildAgentPromptHref(
                            'Summarize this CV: strengths, risks, missing evidence, and best-fit job types. Then propose the next TA action.',
                            buildCvAgentReference(cv),
                          )}
                          title="Ask Agent about this CV"
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:text-primary"
                          >
                            <IconMessageChatbot className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenReview(cv.id)}
                          title="Review CV"
                        >
                          <IconEye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownloadCv(cv.id, cv.filename)}
                          title="Download Original File"
                        >
                          <IconDownload className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownloadSingleExcel(cv.id, cv.extractedName || cv.filename)}
                          title="Download as Excel"
                        >
                          <IconFileSpreadsheet className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          onClick={() => handleDelete(cv.id)}
                          title="Delete CV"
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CV Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={handleReviewDialogChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CV Review</DialogTitle>
          </DialogHeader>
          {isLoadingReview ? (
            <div className="flex flex-col items-center justify-center py-12">
              <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-sm text-muted-foreground">Loading CV details...</p>
            </div>
          ) : reviewData ? (
            <div className="space-y-5">
              {/* Header with download buttons */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{reviewData.extractedName ?? 'Unknown Candidate'}</h3>
                  <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                    {reviewData.extractedEmail && <span>{reviewData.extractedEmail}</span>}
                    {reviewData.extractedPhone && <span>{reviewData.extractedPhone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadSingleExcel(reviewData.id, reviewData.extractedName || reviewData.filename)}
                    title="Download as Excel"
                  >
                    <IconFileSpreadsheet className="mr-2 h-4 w-4" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadCv(reviewData.id, reviewData.filename)}
                  >
                    <IconDownload className="mr-2 h-4 w-4" />
                    Original
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  href={buildAgentPromptHref(
                    'Explain this CV for a recruiter. Focus on strengths, risks, missing evidence, and the safest next step.',
                    buildCvAgentReference(reviewData),
                  )}
                >
                  <Button variant="outline" className="w-full justify-start rounded-xl">
                    <IconMessageChatbot className="mr-2 h-4 w-4" />
                    Explain CV with Agent
                  </Button>
                </Link>
                <Link
                  href={buildAgentPromptHref(
                    'Generate a targeted first-round interview plan for this CV with technical questions, behavioral checks, red flags, and scoring guidance.',
                    buildCvAgentReference(reviewData),
                  )}
                >
                  <Button className="w-full justify-start rounded-xl">
                    <IconChecklist className="mr-2 h-4 w-4" />
                    Draft Questions with Agent
                  </Button>
                </Link>
              </div>

              {reviewReadiness && (
                <EvidenceReadinessPanel
                  readiness={reviewReadiness}
                  title="CV evidence readiness"
                  description="Extraction completeness and missing evidence before TA review or Agent reasoning."
                  compact
                />
              )}

              <Separator />

              {/* Summary */}
              {reviewData.extractedSummary && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Summary</h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    {reviewData.extractedSummary}
                  </p>
                </div>
              )}

              {/* Skills */}
              {reviewData.extractedSkills && reviewData.extractedSkills.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {reviewData.extractedSkills.map((skill, idx) => (
                      <Badge key={`${skill}-${idx}`} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Experience */}
              {reviewData.extractedExperiences && reviewData.extractedExperiences.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Experience</h4>
                  <div className="space-y-2">
                    {reviewData.extractedExperiences.map((exp, i) => (
                      <div key={i} className="text-sm bg-muted p-3 rounded-md">
                        {Object.entries(exp).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium capitalize">{key}: </span>
                            <span className="text-muted-foreground">{value}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {reviewData.extractedEducation && reviewData.extractedEducation.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Education</h4>
                  <div className="space-y-2">
                    {reviewData.extractedEducation.map((edu, i) => (
                      <div key={i} className="text-sm bg-muted p-3 rounded-md">
                        {Object.entries(edu).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium capitalize">{key}: </span>
                            <span className="text-muted-foreground">{value}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Languages */}
              {reviewData.extractedLanguages && reviewData.extractedLanguages.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Languages</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {reviewData.extractedLanguages.map((lang) => (
                      <Badge key={lang} variant="outline" className="text-xs">
                        {lang}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
