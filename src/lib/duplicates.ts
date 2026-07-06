export type DuplicatePersonCandidate = {
  id?: string;
  full_name: string;
  phone?: string | null;
  neighborhood?: string | null;
  location?: string | null;
};

export function normalizePersonName(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizePhoneDigits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizePlace(person: DuplicatePersonCandidate) {
  return normalizePersonName(person.neighborhood ?? person.location ?? "");
}

export function findPotentialDuplicate<T extends DuplicatePersonCandidate>(
  people: T[],
  candidate: DuplicatePersonCandidate,
  ignoreId?: string | null
) {
  const candidateName = normalizePersonName(candidate.full_name);
  const candidatePhone = normalizePhoneDigits(candidate.phone);
  const candidatePlace = normalizePlace(candidate);

  if (!candidateName) return null;

  return (
    people.find((person) => {
      if (ignoreId && person.id === ignoreId) return false;

      const personPhone = normalizePhoneDigits(person.phone);

      if (
        candidatePhone.length >= 8 &&
        personPhone.length >= 8 &&
        candidatePhone === personPhone
      ) {
        return true;
      }

      if (normalizePersonName(person.full_name) !== candidateName) {
        return false;
      }

      if (!candidatePhone || !personPhone) {
        return true;
      }

      const personPlace = normalizePlace(person);
      return Boolean(candidatePlace && personPlace && candidatePlace === personPlace);
    }) ?? null
  );
}
