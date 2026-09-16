"use client";

import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { BranchOption } from "@/modules/branches";
import { ar } from "@/shared/i18n/ar";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

const ANY = "__any__";

const ACTIONS = ["create", "update", "delete", "archive", "restore", "transfer", "login", "lookup"] as const;

/**
 * Filters live in the URL, so a filtered view can be bookmarked, shared with a
 * colleague, and survives a refresh — and the server does the filtering.
 */
export function AuditFilters({
  branches,
  entities,
  canFilterBranch,
}: {
  branches: BranchOption[];
  entities: string[];
  canFilterBranch: boolean;
}) {
  const [isNavigating, navigate] = useNavPending();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ANY) next.delete(key);
    else next.set(key, value);
    // Any filter change returns to the first page; page 7 of the old filter is meaningless.
    next.delete("page");
    navigate(`/audit?${next.toString()}`);
  }

  const hasFilters = [...params.keys()].some((key) => key !== "page");

  /*
   * Disabled as a group while the next screen is being fetched
   * (docs/UX-AUDIT-2026-09.md, finding 3). A fieldset rather than a styling trick:
   * `disabled` here reaches every control inside it, for the keyboard as well as the
   * mouse.
   */
  return (
    <fieldset
      disabled={isNavigating}
      aria-busy={isNavigating}
      className="mb-4 grid gap-3 transition-opacity disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-5"
    >
      {canFilterBranch ? (
        <FilterSelect
          id="filter-branch"
          label={ar.users.branch}
          value={params.get("branchId") ?? ANY}
          onChange={(value) => setParam("branchId", value)}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : null}

      <FilterSelect
        id="filter-entity"
        label={ar.audit.entity}
        value={params.get("entity") ?? ANY}
        onChange={(value) => setParam("entity", value)}
        options={entities.map((entity) => ({ value: entity, label: entity }))}
      />

      <FilterSelect
        id="filter-action"
        label={ar.audit.action}
        value={params.get("action") ?? ANY}
        onChange={(value) => setParam("action", value)}
        options={ACTIONS.map((action) => ({ value: action, label: ar.audit.actions[action] }))}
      />

      <div className="space-y-2">
        <Label htmlFor="filter-from">{ar.common.from}</Label>
        <Input
          id="filter-from"
          type="date"
          value={params.get("from") ?? ""}
          onChange={(event) => setParam("from", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-to">{ar.common.to}</Label>
        <Input
          id="filter-to"
          type="date"
          value={params.get("to") ?? ""}
          onChange={(event) => setParam("to", event.target.value)}
        />
      </div>

      {hasFilters ? (
        <div className="flex items-end">
          <Button variant="ghost" size="sm" onClick={() => navigate("/audit")}>
            <X className="size-4" aria-hidden />
            {ar.audit.clearFilters}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

function FilterSelect(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger id={props.id} className="w-full">
          <SelectValue placeholder={ar.common.all} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{ar.common.all}</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
