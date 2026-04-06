import { Controller, Get, Query, Inject } from "@nestjs/common";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { desc, eq, and, or, sql } from "drizzle-orm";
import { DB_TOKEN } from "../../common/database.module";

// Case-insensitive address equality — DB stores checksummed, callers may send lowercase
const addrEq = (col: any, val: string) =>
  sql`lower(${col}) = ${val.toLowerCase()}`;
import {
  navHistory,
  vaultTransactions,
  stablecoinTransfers,
  reserveUpdates,
  indexedEvents,
  indexerCursor,
  knownVaults,
  splitPositions,
  creditPositions,
} from "../../config/database";

@Controller("api")
export class EventsController {
  constructor(@Inject(DB_TOKEN) private readonly db: PostgresJsDatabase) {}

  /** GET /api/nav-history?vault=0x...&limit=100 */
  @Get("nav-history")
  async getNavHistory(
    @Query("vault") vault?: string,
    @Query("limit") limit?: string,
  ) {
    const lim = Math.min(parseInt(limit || "100", 10), 1000);
    let query = this.db
      .select()
      .from(navHistory)
      .orderBy(desc(navHistory.reportedTimestamp))
      .limit(lim) as any;

    if (vault) query = query.where(addrEq(navHistory.vaultAddress, vault));
    return query;
  }

  /** GET /api/vault-transactions?vault=0x...&owner=0x...&limit=50 */
  @Get("vault-transactions")
  async getVaultTransactions(
    @Query("vault") vault?: string,
    @Query("owner") owner?: string,
    @Query("limit") limit?: string,
  ) {
    const lim = Math.min(parseInt(limit || "50", 10), 500);
    const conditions: any[] = [];
    if (vault) conditions.push(addrEq(vaultTransactions.vaultAddress, vault));
    if (owner) conditions.push(addrEq(vaultTransactions.owner, owner));

    let query = this.db
      .select()
      .from(vaultTransactions)
      .orderBy(desc(vaultTransactions.blockNumber))
      .limit(lim) as any;

    if (conditions.length > 0) query = query.where(and(...conditions));
    return query;
  }

  /** GET /api/transfers?address=0x...&limit=50 */
  @Get("transfers")
  async getTransfers(
    @Query("address") address?: string,
    @Query("limit") limit?: string,
  ) {
    const lim = Math.min(parseInt(limit || "50", 10), 500);
    let query = this.db
      .select()
      .from(stablecoinTransfers)
      .orderBy(desc(stablecoinTransfers.blockNumber))
      .limit(lim) as any;

    if (address) {
      query = query.where(
        or(
          addrEq(stablecoinTransfers.from, address),
          addrEq(stablecoinTransfers.to, address),
        ),
      );
    }
    return query;
  }

  /** GET /api/reserve-history?limit=100 */
  @Get("reserve-history")
  async getReserveHistory(@Query("limit") limit?: string) {
    const lim = Math.min(parseInt(limit || "100", 10), 1000);
    return this.db
      .select()
      .from(reserveUpdates)
      .orderBy(desc(reserveUpdates.blockNumber))
      .limit(lim);
  }

  /** GET /api/events?contract=stablecoin&event=Transfer&limit=50 */
  @Get("events")
  async getEvents(
    @Query("contract") contract?: string,
    @Query("event") event?: string,
    @Query("limit") limit?: string,
  ) {
    const lim = Math.min(parseInt(limit || "50", 10), 500);
    const conditions: any[] = [];
    if (contract) conditions.push(eq(indexedEvents.contractName, contract));
    if (event) conditions.push(eq(indexedEvents.eventName, event));

    let query = this.db
      .select()
      .from(indexedEvents)
      .orderBy(desc(indexedEvents.blockNumber))
      .limit(lim) as any;

    if (conditions.length > 0) query = query.where(and(...conditions));
    return query;
  }

  /** GET /api/indexer-status */
  @Get("indexer-status")
  async getIndexerStatus() {
    const [cursors, vaults] = await Promise.all([
      this.db.select().from(indexerCursor),
      this.db.select().from(knownVaults),
    ]);
    return { cursors, vaults };
  }

  /** GET /api/split-positions?user=0x...&limit=50
   *  Returns Split / Unsplit / PTRedeemed / YTRedeemed history for a user.
   */
  @Get("split-positions")
  async getSplitPositions(
    @Query("user") user?: string,
    @Query("limit") limit?: string,
  ) {
    const lim = Math.min(parseInt(limit || "50", 10), 500);
    let query = this.db
      .select()
      .from(splitPositions)
      .orderBy(desc(splitPositions.blockNumber))
      .limit(lim) as any;

    if (user) query = query.where(addrEq(splitPositions.user, user));
    return query;
  }

  /** GET /api/credit-positions?user=0x...&limit=50
   *  Returns borrow / repay / liquidation history for a user.
   */
  @Get("credit-positions")
  async getCreditPositions(
    @Query("user") user?: string,
    @Query("limit") limit?: string,
  ) {
    const lim = Math.min(parseInt(limit || "50", 10), 500);
    let query = this.db
      .select()
      .from(creditPositions)
      .orderBy(desc(creditPositions.blockNumber))
      .limit(lim) as any;

    if (user) query = query.where(addrEq(creditPositions.user, user));
    return query;
  }

  /** GET /api/at-risk-positions
   *  Returns all positions that have been liquidated (event_type = 'liquidated').
   *  Front-end can use this to show recently liquidated accounts.
   */
  @Get("at-risk-positions")
  async getAtRiskPositions(@Query("limit") limit?: string) {
    const lim = Math.min(parseInt(limit || "100", 10), 1000);
    return this.db
      .select()
      .from(creditPositions)
      .where(eq(creditPositions.eventType, "liquidated"))
      .orderBy(desc(creditPositions.blockNumber))
      .limit(lim);
  }
}
