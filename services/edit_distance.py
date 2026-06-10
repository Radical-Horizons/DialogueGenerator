"""Distance d'édition bornée (Levenshtein) pour suggestions typo (Story 9.5)."""


def levenshtein_bounded(a: str, b: str, max_dist: int) -> int:
    """Distance d'édition avec arrêt précoce si > ``max_dist``."""
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if abs(la - lb) > max_dist:
        return max_dist + 1
    prev = list(range(lb + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        row_min = cur[0]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            v = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            cur.append(v)
            if v < row_min:
                row_min = v
        if row_min > max_dist:
            return max_dist + 1
        prev = cur
    return prev[-1] if prev[-1] <= max_dist else max_dist + 1
