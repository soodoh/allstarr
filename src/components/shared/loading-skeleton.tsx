// oxlint-disable react/no-array-index-key -- Skeleton arrays have no meaningful data keys
import type React from "react";
import Skeleton from "src/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "src/components/ui/card";

export function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function TableSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function HardcoverAuthorSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-32" />

      {/* Page header */}
      <div className="flex justify-between items-start">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="space-y-6">
        {/* Photo + details + bio row */}
        <div className="flex flex-col gap-6 xl:flex-row">
          <Skeleton className="w-full xl:w-44 aspect-[2/3] xl:aspect-auto xl:h-48 rounded-lg shrink-0" />
          <Card className="w-full xl:w-auto xl:shrink-0">
            <CardHeader>
              <Skeleton className="h-5 w-16" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="w-full xl:flex-1">
            <CardHeader>
              <Skeleton className="h-5 w-20" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>

        {/* Books card */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-12 mb-1" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Toolbar */}
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-48" />
            </div>
            {/* Pagination bar */}
            <Skeleton className="h-9 w-full" />
            {/* Table */}
            <div className="space-y-0">
              <Skeleton className="h-10 w-full rounded-b-none" />
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-12 w-full rounded-none border-t-0"
                />
              ))}
            </div>
            {/* Bottom pagination */}
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SystemStatusSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      {/* Health card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
      {/* Disk space card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
      {/* About card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function DetailSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
