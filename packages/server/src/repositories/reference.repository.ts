import type { Kysely } from 'kysely';
import {
  BASE_CURRENCY,
  DEPARTMENTS,
  LEVELS,
  type CurrencyCode,
  type Level,
  type ReferenceData,
} from '@acme/shared';
import type { Database } from '../db/types';

/** Countries, currencies, exchange rates and bands — everything the UI needs on boot. */
export class ReferenceRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async load(): Promise<ReferenceData> {
    const [countries, rates] = await Promise.all([
      this.db
        .selectFrom('countries')
        .select(['code', 'name', 'region', 'currency_code'])
        .orderBy('name')
        .execute(),
      this.db
        .selectFrom('fx_rates')
        .select(['currency_code', 'rate_to_base_micros', 'as_of'])
        .execute(),
    ]);

    return {
      countries: countries.map((country) => ({
        code: country.code,
        name: country.name,
        region: country.region,
        currency: country.currency_code,
      })),
      departments: [...DEPARTMENTS],
      levels: [...LEVELS],
      fx: {
        asOf: rates[0]?.as_of ?? new Date().toISOString().slice(0, 10),
        baseCurrency: BASE_CURRENCY,
        rates: Object.fromEntries(
          rates.map((rate) => [rate.currency_code, rate.rate_to_base_micros]),
        ),
      },
    };
  }

  async currencyForCountry(countryCode: string): Promise<CurrencyCode | null> {
    const row = await this.db
      .selectFrom('countries')
      .select('currency_code')
      .where('code', '=', countryCode)
      .executeTakeFirst();
    return row?.currency_code ?? null;
  }

  async bandFor(
    countryCode: string,
    level: Level,
  ): Promise<{ minMinor: number; midMinor: number; maxMinor: number } | null> {
    const row = await this.db
      .selectFrom('salary_bands')
      .select(['min_minor', 'mid_minor', 'max_minor'])
      .where('country_code', '=', countryCode)
      .where('level', '=', level)
      .executeTakeFirst();

    return row
      ? { minMinor: row.min_minor, midMinor: row.mid_minor, maxMinor: row.max_minor }
      : null;
  }
}
