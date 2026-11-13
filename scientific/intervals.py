"""Indexed interval queries for sliding mission windows."""

import numpy as np

from . import mini_model as model


class IntervalIndex:
    """O(log W) overlap and O(log W) longest clipped overlap after O(W log W) setup."""

    def __init__(self, windows):
        merged = model.merge_windows(windows)
        self.starts = np.array([a for a, _ in merged], dtype=float)
        self.ends = np.array([b for _, b in merged], dtype=float)
        lengths = self.ends - self.starts
        self.prefix = np.r_[0.0, np.cumsum(lengths)]
        self.table = [lengths]
        width = 2
        while width <= len(lengths):
            previous = self.table[-1]
            half = width // 2
            self.table.append(np.maximum(previous[:-half], previous[half:]))
            width *= 2

    def _integral_to(self, time_s):
        complete = int(np.searchsorted(self.ends, time_s, side="right"))
        value = float(self.prefix[complete])
        if complete < len(self.starts):
            value += max(0.0, time_s - self.starts[complete])
        return value

    def total(self, start, end):
        if not np.isfinite([start, end]).all() or end < start:
            raise ValueError("Interval query bounds must be finite and ordered.")
        return self._integral_to(end) - self._integral_to(start)

    def longest(self, start, end):
        if not np.isfinite([start, end]).all() or end < start:
            raise ValueError("Interval query bounds must be finite and ordered.")
        first = int(np.searchsorted(self.ends, start, side="right"))
        last = int(np.searchsorted(self.starts, end, side="left")) - 1
        if first > last:
            return 0.0
        if first == last:
            return max(0.0, min(end, self.ends[first]) - max(start, self.starts[first]))
        best = max(self.ends[first] - max(start, self.starts[first]),
                   min(end, self.ends[last]) - self.starts[last])
        left, right = first + 1, last - 1
        count = right - left + 1
        if count > 0:
            level = count.bit_length() - 1
            best = max(best, self.table[level][left], self.table[level][right - (1 << level) + 1])
        return float(best)


class SampleIntegral:
    """Antiderivative of a piecewise-linear sampled quantity, including partial cells."""

    def __init__(self, times_s, values):
        self.times, self.values = model.checked_time_series(times_s, values)
        self.slopes = np.diff(self.values) / np.diff(self.times)
        self.prefix = np.r_[0.0, np.cumsum(np.diff(self.times) *
                                          (self.values[1:] + self.values[:-1]) / 2)]

    def _at(self, time_s):
        if not self.times[0] <= time_s <= self.times[-1]:
            raise ValueError("Integral query is outside sample coverage.")
        index = min(int(np.searchsorted(self.times, time_s, side="right")) - 1,
                    len(self.times) - 2)
        delta = time_s - self.times[index]
        return float(self.prefix[index] + self.values[index] * delta
                     + self.slopes[index] * delta**2 / 2)

    def total(self, start, end):
        if end < start:
            raise ValueError("Integral query bounds must be ordered.")
        return self._at(end) - self._at(start)
