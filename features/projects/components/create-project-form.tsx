'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { createProjectSchema, type CreateProjectSchema } from '../schemas';
import { createProjectAction } from '../actions';

export function CreateProjectForm() {
  const [isPending, startTransition] = useTransition();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateProjectSchema>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      status: 'draft',
    },
  });

  const onSubmit = (data: CreateProjectSchema) => {
    startTransition(async () => {
      await createProjectAction(data);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Project Name</Label>
        <Input
          id="name"
          placeholder="Enter project name"
          {...register('name')}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe your project"
          rows={4}
          {...register('description')}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p className="text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select id="status" {...register('status')}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
        {errors.status && (
          <p className="text-sm text-red-600">{errors.status.message}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full rounded-full"
        disabled={isPending}
      >
        {isPending ? 'Creating...' : 'Create Project'}
      </Button>
    </form>
  );
}
