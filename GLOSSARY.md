# Allstarr

Allstarr manages media files associated with books, movies, and TV episodes.

## Language

**Completed import**:
The placement of files from a completed tracked download into the managed library. It is distinct from Mapping an existing unmapped file.

**Job run**:
One execution of an Allstarr scheduled task or on-demand command, with its own progress and outcome.

**Wanted item**:
A book, movie, or TV episode eligible for automatic search because it is missing files or may qualify for an upgrade under an available download profile.

**Indexer**:
A configured source of releases that can be searched and grabbed, either configured directly in Allstarr or synced from an indexer manager.

**Grab attempt**:
A request to a download client to add a release. A rejected request is still an attempt; resolving a client or provider without sending the request is not.

**Upgrade-safe fallback**:
An acceptable alternative to a cap-blocked release that would not subsequently be upgraded by any higher-ranked cap-blocked release under the selected download profile’s current settings.

**Mapping**:
The association of an unmapped media file with a book, movie, or TV episode, placing that file and its selected related assets in the managed library. Mapping is distinct from importing a completed tracked download.
_Avoid_: Download import (when referring to mapping an existing unmapped file)
