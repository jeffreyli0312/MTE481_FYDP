#!/usr/bin/env python3
"""
Plot EMG and IMU data from exported CSV files.

Usage:
    python plot_set.py <raw_csv> <processed_csv>

    raw_csv       - Path to the *_raw.csv file exported from the app
    processed_csv - Path to the *_processed.csv file exported from the app

Generates 4 separate PDF plots saved to outputs/<date_setlabel>/:
    1. emg_raw.pdf       - Raw EMG (all 4 channels)
    2. emg_processed.pdf - Processed EMG (baseline-subtracted / %MVC)
    3. imu_raw.pdf       - Raw IMU (roll, pitch, yaw for L and R)
    4. imu_processed.pdf - Processed IMU
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUTS_DIR = SCRIPT_DIR / "outputs"

EMG_COLUMNS = [
    "emg_left_tricep",
    "emg_left_pec",
    "emg_right_tricep",
    "emg_right_pec",
]

EMG_LABELS = [
    "L Tricep",
    "L Pec",
    "R Tricep",
    "R Pec",
]

IMU_COLUMNS = [
    "l_roll", "l_pitch", "l_yaw",
    "r_roll", "r_pitch", "r_yaw",
]

IMU_LABELS = [
    "L Roll", "L Pitch", "L Yaw",
    "R Roll", "R Pitch", "R Yaw",
]

IMU_COLORS = [
    "#e74c3c", "#2ecc71", "#3498db",
    "#e67e22", "#1abc9c", "#9b59b6",
]


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "t_ms" not in df.columns:
        print(f"Error: '{path}' does not contain a 't_ms' column.", file=sys.stderr)
        sys.exit(1)
    return df


def time_axis(df: pd.DataFrame):
    """Convert t_ms to seconds relative to the first sample."""
    t = df["t_ms"].values
    return (t - t[0]) / 1000.0


def make_emg_figure(df: pd.DataFrame, t, title: str) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(14, 6))
    for col, label in zip(EMG_COLUMNS, EMG_LABELS):
        if col in df.columns:
            ax.plot(t, df[col].values, label=label, linewidth=0.6, alpha=0.85)
    ax.set_title(title, fontweight="bold", fontsize=13)
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("EMG")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    return fig


def make_imu_figure(df: pd.DataFrame, t, title: str) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(14, 6))
    for col, label, color in zip(IMU_COLUMNS, IMU_LABELS, IMU_COLORS):
        if col in df.columns:
            ax.plot(t, df[col].values, label=label, linewidth=0.7, alpha=0.85, color=color)
    ax.set_title(title, fontweight="bold", fontsize=13)
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Angle (degrees)")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    return fig


def main():
    parser = argparse.ArgumentParser(
        description="Plot EMG and IMU data from exported CSV files. "
                    "Outputs 4 PDFs into outputs/<date_setlabel>/."
    )
    parser.add_argument("raw_csv", help="Path to the raw CSV file")
    parser.add_argument("processed_csv", help="Path to the processed CSV file")
    args = parser.parse_args()

    for p in (args.raw_csv, args.processed_csv):
        if not Path(p).is_file():
            print(f"Error: file not found: {p}", file=sys.stderr)
            sys.exit(1)

    raw = load_csv(args.raw_csv)
    processed = load_csv(args.processed_csv)

    # Derive the set label from the raw filename (e.g. "Set_1_raw.csv" -> "Set_1")
    set_label = Path(args.raw_csv).stem.replace("_raw", "")
    date_str = datetime.now().strftime("%Y-%m-%d")
    folder_name = f"{date_str}_{set_label}"

    out_dir = OUTPUTS_DIR / folder_name
    out_dir.mkdir(parents=True, exist_ok=True)

    t_raw = time_axis(raw)
    t_proc = time_axis(processed)

    plots = [
        (make_emg_figure(raw, t_raw, f"{set_label} — Raw EMG"), "emg_raw.pdf"),
        (make_emg_figure(processed, t_proc, f"{set_label} — Processed EMG"), "emg_processed.pdf"),
        (make_imu_figure(raw, t_raw, f"{set_label} — Raw IMU (Roll / Pitch / Yaw)"), "imu_raw.pdf"),
        (make_imu_figure(processed, t_proc, f"{set_label} — Processed IMU (Roll / Pitch / Yaw)"), "imu_processed.pdf"),
    ]

    for fig, filename in plots:
        path = out_dir / filename
        fig.savefig(path, format="pdf", dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"  Saved: {path}")

    print(f"\nAll plots saved to: {out_dir}")


if __name__ == "__main__":
    main()
