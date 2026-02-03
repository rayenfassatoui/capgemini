import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Project } from '../types';
import { IconFolder, IconArchive, IconFileText } from '@tabler/icons-react';

interface ProjectCardProps {
  project: Project;
}

const STATUS_CONFIG = {
  active: {
    label: 'Active',
    variant: 'default' as const,
    icon: IconFolder,
  },
  archived: {
    label: 'Archived',
    variant: 'secondary' as const,
    icon: IconArchive,
  },
  draft: {
    label: 'Draft',
    variant: 'outline' as const,
    icon: IconFileText,
  },
};

export function ProjectCard({ project }: ProjectCardProps) {
  const statusConfig = STATUS_CONFIG[project.status];
  const StatusIcon = statusConfig.icon;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="group relative overflow-hidden rounded-xl border border-gray-200 p-6 transition-all hover:border-gray-300 hover:shadow-lg dark:border-gray-800 dark:hover:border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <StatusIcon className="h-5 w-5 text-gray-500" />
              <h3 className="font-sans text-lg font-semibold text-gray-900 dark:text-white">
                {project.name}
              </h3>
            </div>
            
            {project.description && (
              <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                {project.description}
              </p>
            )}
            
            <div className="flex items-center gap-2 pt-2">
              <Badge variant={statusConfig.variant}>
                {statusConfig.label}
              </Badge>
              
              <span className="text-xs text-gray-500">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient opacity-0 transition-opacity group-hover:opacity-100" />
      </Card>
    </Link>
  );
}
