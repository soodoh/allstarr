import { useMemo, useState } from "react";
import type { JSX } from "react";
import { TabsContent } from "src/components/ui/tabs";
import ProfileEditionCard from "src/components/bookshelf/books/profile-edition-card";
import type { EditionData } from "src/components/bookshelf/books/profile-edition-card";
import EditionSelectionModal from "src/components/bookshelf/books/edition-selection-modal";
import { useSetEditionForProfile } from "src/hooks/mutations";

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  type: string;
  language: string;
};

type Edition = EditionData & {
  downloadProfileIds: number[];
};

type ProfileType = {
  id: number;
  name: string;
  icon: string;
  type: "ebook" | "audiobook";
};

export default function EditionsTab({
  bookId,
  authorDownloadProfiles,
  editions,
}: {
  bookId: number;
  authorDownloadProfiles: DownloadProfile[];
  editions: Edition[];
}): JSX.Element {
  const [selectingProfile, setSelectingProfile] = useState<ProfileType | null>(
    null,
  );
  const setEditionForProfile = useSetEditionForProfile();
  // For each profile, find the edition whose downloadProfileIds includes that profile's ID
  const profileEditionMap = useMemo(() => {
    const map = new Map<number, EditionData | null>();
    for (const profile of authorDownloadProfiles) {
      const matchingEdition = editions.find((e) =>
        e.downloadProfileIds.includes(profile.id),
      );
      map.set(profile.id, matchingEdition ?? null);
    }
    return map;
  }, [authorDownloadProfiles, editions]);

  // Sort: monitored profiles first, then unmonitored
  const sortedProfiles = useMemo(() => {
    return [...authorDownloadProfiles].toSorted((a, b) => {
      const aMonitored = profileEditionMap.get(a.id) !== null;
      const bMonitored = profileEditionMap.get(b.id) !== null;
      if (aMonitored && !bMonitored) {
        return -1;
      }
      if (!aMonitored && bMonitored) {
        return 1;
      }
      return 0;
    });
  }, [authorDownloadProfiles, profileEditionMap]);

  return (
    <TabsContent
      value="editions"
      className="flex-1 min-h-0 flex flex-col gap-3"
    >
      <div className="flex flex-col gap-3">
        {sortedProfiles.map((profile) => {
          const edition = profileEditionMap.get(profile.id) ?? null;
          return (
            <ProfileEditionCard
              key={profile.id}
              profile={{
                id: profile.id,
                name: profile.name,
                icon: profile.icon,
                type: profile.type as "ebook" | "audiobook",
              }}
              edition={edition}
              onChooseEdition={() =>
                setSelectingProfile({
                  id: profile.id,
                  name: profile.name,
                  icon: profile.icon,
                  type: profile.type as "ebook" | "audiobook",
                })
              }
              onUnmonitor={() => {
                // Stub: will be wired to unmonitor dialog in Task 10
              }}
            />
          );
        })}
        {sortedProfiles.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No download profiles assigned to this author.
          </p>
        )}
      </div>
      {selectingProfile && (
        <EditionSelectionModal
          open={Boolean(selectingProfile)}
          onOpenChange={(open) => !open && setSelectingProfile(null)}
          bookId={bookId}
          profile={selectingProfile}
          currentEditionId={
            editions.find((e) =>
              e.downloadProfileIds.includes(selectingProfile.id),
            )?.id
          }
          onConfirm={(editionId) => {
            setEditionForProfile.mutate(
              { editionId, downloadProfileId: selectingProfile.id },
              { onSuccess: () => setSelectingProfile(null) },
            );
          }}
          isPending={setEditionForProfile.isPending}
        />
      )}
    </TabsContent>
  );
}
