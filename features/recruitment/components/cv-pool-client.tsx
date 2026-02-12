'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconUpload,
  IconTrash,
  IconFileText,
  IconX,
  IconLoader2,
  IconSearch,
  IconDownload,
  IconFileSpreadsheet,
  IconEye,
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
import { uploadCvAction, deleteCvAction, exportCvPoolAction, getCvDetailsAction, getCvFileAction } from '../actions';

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
}

interface CvFullDetails {
  id: string;
  filename: string;
  extractedName: string | null;
  extractedEmail: string | null;
  extractedPhone: string | null;
  extractedSkills: string[] | null;
  extractedExperiences: Array<Record<string, string>> | null;
  extractedEducation: Array<Record<string, string>> | null;
  extractedLanguages: string[] | null;
  extractedSummary: string | null;
}

interface CvPoolClientProps {
  initialData: CvRecord[];
}

export function CvPoolClient({ initialData }: CvPoolClientProps) {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Review dialog state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState<CvFullDetails | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);

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

  const handleFileUpload = async (file: File) => {
    if (
      ![
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.type)
    ) {
      toast.error('Invalid file type. Please upload PDF or DOCX.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading(`Uploading "${file.name}"... This may take a moment while AI extracts data.`);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      await uploadCvAction({
        filename: file.name,
        contentType: file.type,
        size: file.size,
        rawBytes: base64,
      });

      toast.success('CV uploaded and parsed successfully!', { id: toastId });
      setIsUploadOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload CV. Please try again.', { id: toastId });
    } finally {
      setIsUploading(false);
    }
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDelete = async (cvId: string) => {
    if (!confirm('Are you sure you want to delete this CV?')) return;

    try {
      await deleteCvAction(cvId);
      toast.success('CV deleted');
      router.refresh();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete CV');
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const base64 = await exportCvPoolAction();
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
      a.download = `cv-pool-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CV Pool exported to Excel');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export CV Pool');
    } finally {
      setIsExporting(false);
    }
  };

  const handleViewCv = async (cvId: string) => {
    setIsLoadingReview(true);
    setReviewOpen(true);
    try {
      const details = await getCvDetailsAction(cvId);
      setReviewData(details as CvFullDetails);
    } catch (error) {
      console.error('Review error:', error);
      toast.error('Failed to load CV details');
      setReviewOpen(false);
    } finally {
      setIsLoadingReview(false);
    }
  };

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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search CVs..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || initialData.length === 0}
          >
            <IconFileSpreadsheet className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export Excel'}
          </Button>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
              <IconUpload className="mr-2 h-4 w-4" />
              Upload CV
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Resume</DialogTitle>
                <DialogDescription>
                  Upload a PDF or DOCX file to add to the CV pool.
                </DialogDescription>
              </DialogHeader>
              <div
                className={`
                  mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors
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
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Processing and extracting data with AI...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="rounded-full bg-primary/10 p-4">
                      <IconUpload className="h-8 w-8 text-primary" />
                    </div>
                    <div className="mt-2">
                      <p className="text-sm font-medium">
                        Drag & drop or click to upload
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, DOCX up to 5MB
                      </p>
                    </div>
                    <Input
                      type="file"
                      className="hidden"
                      id="file-upload"
                      accept=".pdf,.docx"
                      onChange={(e) =>
                        e.target.files?.[0] && handleFileUpload(e.target.files[0])
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() =>
                        document.getElementById('file-upload')?.click()
                      }
                    >
                      Select File
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="px-6 py-4">
          <CardTitle>All Candidates</CardTitle>
          <CardDescription>
            Manage your talent pool and view parsed candidate details.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>File Info</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCvs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No CVs found. Upload one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCvs.map((cv) => (
                  <TableRow key={cv.id}>
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
                        {cv.extractedSkills?.slice(0, 3).map((skill) => (
                          <Badge
                            key={skill}
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
                      {new Date(cv.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleViewCv(cv.id)}
                          title="Review CV"
                        >
                          <IconEye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownloadCv(cv.id, cv.filename)}
                          title="Download CV"
                        >
                          <IconDownload className="h-4 w-4" />
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
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
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
              {/* Header */}
              <div>
                <h3 className="text-lg font-semibold">{reviewData.extractedName ?? 'Unknown Candidate'}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                  {reviewData.extractedEmail && <span>{reviewData.extractedEmail}</span>}
                  {reviewData.extractedPhone && <span>{reviewData.extractedPhone}</span>}
                </div>
              </div>

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
                    {reviewData.extractedSkills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs">
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

              {/* Download button */}
              <Separator />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadCv(reviewData.id, reviewData.filename)}
              >
                <IconDownload className="mr-2 h-4 w-4" />
                Download Original File
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
