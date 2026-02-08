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
import { uploadCvAction, deleteCvAction } from '../actions';

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

interface CvPoolClientProps {
  initialData: CvRecord[];
}

export function CvPoolClient({ initialData }: CvPoolClientProps) {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    // Validate file type
    if (
      ![
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.type)
    ) {
      toast.error('Invalid file type. Please upload PDF or DOCX.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        await uploadCvAction({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          rawBytes: base64,
        });
        toast.success('CV uploaded successfully');
        setIsUploadOpen(false);
        router.refresh();
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload CV');
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
                    Processing file...
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
                <TableHead className="w-[80px]"></TableHead>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                        onClick={() => handleDelete(cv.id)}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
