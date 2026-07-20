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

export function normalizeBrazilPhone(value?: string | null, defaultDdd = "71") {
  const digits = (value ?? "").replace(/\D/g, "");

  if (!digits) return "";

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits.slice(2);
  }

  if (digits.length === 8 || digits.length === 9) {
    return `${defaultDdd}${digits}`;
  }

  return digits;
}

export function normalizePhoneDigits(value?: string | null) {
  return normalizeBrazilPhone(value);
}

function normalizePlace(person: DuplicatePersonCandidate) {
  return normalizePersonName(person.neighborhood ?? person.location ?? "");
}

export function areLikelyDuplicatePeople(
  first: DuplicatePersonCandidate,
  second: DuplicatePersonCandidate
) {
  const firstName = normalizePersonName(first.full_name);
  const secondName = normalizePersonName(second.full_name);
  const firstPhone = normalizePhoneDigits(first.phone);
  const secondPhone = normalizePhoneDigits(second.phone);

  if (
    firstPhone.length >= 8
    && secondPhone.length >= 8
    && firstPhone === secondPhone
  ) {
    return true;
  }

  if (!firstName || firstName !== secondName) return false;
  if (!firstPhone || !secondPhone) return true;

  const firstPlace = normalizePlace(first);
  const secondPlace = normalizePlace(second);
  return Boolean(firstPlace && secondPlace && firstPlace === secondPlace);
}

export function findPotentialDuplicate<T extends DuplicatePersonCandidate>(
  people: T[],
  candidate: DuplicatePersonCandidate,
  ignoreId?: string | null
) {
  const candidateName = normalizePersonName(candidate.full_name);

  if (!candidateName) return null;

  return (
    people.find((person) => {
      if (ignoreId && person.id === ignoreId) return false;

      return areLikelyDuplicatePeople(person, candidate);
    }) ?? null
  );
}
