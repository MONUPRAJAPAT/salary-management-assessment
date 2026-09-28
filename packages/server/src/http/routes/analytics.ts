import { Router } from 'express';
import type { Kysely } from 'kysely';
import {
  analyticsFilterSchema,
  dimensionQuerySchema,
  distributionQuerySchema,
  payGapQuerySchema,
  payrollTrendQuerySchema,
} from '@acme/shared';
import type { Database } from '../../db/types';
import { AnalyticsService } from '../../services/analytics.service';
import { parseOrThrow } from '../validate';

export function analyticsRoutes(db: Kysely<Database>): Router {
  const router = Router();
  const analytics = new AnalyticsService(db);

  router.get('/overview', async (req, res) => {
    const filter = parseOrThrow(analyticsFilterSchema, req.query, 'analytics filters');
    res.json(await analytics.overview(filter));
  });

  router.get('/breakdown', async (req, res) => {
    const query = parseOrThrow(dimensionQuerySchema, req.query, 'analytics filters');
    res.json(await analytics.breakdown(query.dimension, query));
  });

  router.get('/pay-gap', async (req, res) => {
    const query = parseOrThrow(payGapQuerySchema, req.query, 'analytics filters');
    res.json(await analytics.payGap(query.groupBy, query));
  });

  router.get('/band-health', async (req, res) => {
    const filter = parseOrThrow(analyticsFilterSchema, req.query, 'analytics filters');
    res.json(await analytics.bandHealth(filter));
  });

  router.get('/distribution', async (req, res) => {
    const query = parseOrThrow(distributionQuerySchema, req.query, 'analytics filters');
    res.json(await analytics.distribution(query, query.bucketCount));
  });

  router.get('/payroll-trend', async (req, res) => {
    const query = parseOrThrow(payrollTrendQuerySchema, req.query, 'analytics filters');
    res.json(await analytics.payrollTrend(query, query.months));
  });

  return router;
}
