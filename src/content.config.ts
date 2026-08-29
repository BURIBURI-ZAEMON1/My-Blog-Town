import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    townId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    series: z.string().min(1).optional(),
    seriesIndex: z.number().int().min(0).optional(),
    date: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    building: z.enum(['a', 'b', 'c', 'forge', 'shop', 'home']).default('home'),
    mapId: z.string().default('town-01'),
    featured: z.boolean().default(false),
    cover: z.string().startsWith('/').optional(),
    coverAlt: z.string().optional(),
  }).superRefine((post, context) => {
    if ((post.series && post.seriesIndex === undefined) || (!post.series && post.seriesIndex !== undefined)) {
      context.addIssue({ code: 'custom', message: 'series and seriesIndex must be provided together' });
    }
  }),
});

export const collections = { posts };
