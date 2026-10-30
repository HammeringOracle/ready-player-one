from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "ready-player-one-program-topology-v4.pdf"

NAVY = HexColor("#09111f")
PANEL = HexColor("#111c2e")
PANEL_2 = HexColor("#17253a")
BLUE = HexColor("#67a8ff")
CYAN = HexColor("#52d6d1")
GREEN = HexColor("#6ed083")
MAGENTA = HexColor("#e45db8")
YELLOW = HexColor("#f2c94c")
RED = HexColor("#ef6a68")
WHITE = HexColor("#f6f8fc")
MUTED = HexColor("#a9b6c9")
GRID = HexColor("#2b3a50")


def rounded_box(c, x, y, w, h, title, lines, accent=BLUE, title_size=10, body_size=7.2):
    c.setFillColor(PANEL)
    c.setStrokeColor(accent)
    c.setLineWidth(1.25)
    c.roundRect(x, y, w, h, 8, fill=1, stroke=1)
    c.setFillColor(accent)
    c.roundRect(x, y + h - 8, w, 8, 8, fill=1, stroke=0)
    c.rect(x, y + h - 8, w, 4, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", title_size)
    c.drawString(x + 10, y + h - 22, title)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", body_size)
    cursor = y + h - 35
    for line in lines:
        c.drawString(x + 10, cursor, line)
        cursor -= 10


def arrow(c, x1, y1, x2, y2, color=BLUE, label=None, label_dx=0, label_dy=0):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.8)
    c.line(x1, y1, x2, y2)
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 6
    for delta in (2.55, -2.55):
        c.line(x2, y2, x2 + size * math.cos(angle + delta), y2 + size * math.sin(angle + delta))
    if label:
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString((x1 + x2) / 2 + label_dx, (y1 + y2) / 2 + label_dy, label)


def disk_segment(c, x, y, w, h, label, sublabel, color, text=WHITE):
    c.setFillColor(color)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setFillColor(text)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(x + w / 2, y + h / 2 + 2, label)
    c.setFont("Helvetica", 5.5)
    c.drawCentredString(x + w / 2, y + h / 2 - 7, sublabel)


def mini_pc(c, x, y, accent):
    c.setFillColor(HexColor("#202b3d"))
    c.setStrokeColor(accent)
    c.setLineWidth(1)
    c.roundRect(x, y, 34, 25, 4, fill=1, stroke=1)
    c.setFillColor(HexColor("#36465e"))
    c.rect(x + 4, y + 5, 26, 13, fill=1, stroke=0)
    c.setFillColor(accent)
    c.circle(x + 27, y + 21, 1.4, fill=1, stroke=0)
    c.setStrokeColor(MUTED)
    c.line(x + 8, y + 2, x + 26, y + 2)


def laptop(c, x, y, accent):
    c.setFillColor(HexColor("#202b3d"))
    c.setStrokeColor(accent)
    c.setLineWidth(1)
    c.roundRect(x + 4, y + 7, 28, 20, 3, fill=1, stroke=1)
    c.setFillColor(HexColor("#304d73"))
    c.rect(x + 7, y + 10, 22, 14, fill=1, stroke=0)
    c.setFillColor(HexColor("#59697f"))
    c.roundRect(x, y + 2, 36, 5, 2, fill=1, stroke=0)
    c.setFillColor(accent)
    c.rect(x + 15, y + 3, 6, 1, fill=1, stroke=0)


def machine_box(c, x, y, w, h, title, lines, accent, kind):
    c.setFillColor(PANEL)
    c.setStrokeColor(accent)
    c.setLineWidth(1.25)
    c.roundRect(x, y, w, h, 8, fill=1, stroke=1)
    c.setFillColor(accent)
    c.roundRect(x, y + h - 8, w, 8, 8, fill=1, stroke=0)
    c.rect(x, y + h - 8, w, 4, fill=1, stroke=0)
    (laptop if kind == "laptop" else mini_pc)(c, x + 10, y + h - 57, accent)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x + 52, y + h - 22, title)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.5)
    cursor = y + h - 38
    for line in lines:
        c.drawString(x + 52, cursor, f"- {line}")
        cursor -= 10


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=landscape(letter))
    width, height = landscape(letter)
    c.setTitle("Ready Player One - Program and Deployment Topology")
    c.setAuthor("Ready Player One")

    c.setFillColor(NAVY)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setStrokeColor(HexColor("#132039"))
    c.setLineWidth(.25)
    for x in range(0, int(width), 18):
        c.line(x, 0, x, height)
    for y in range(0, int(height), 18):
        c.line(0, y, width, y)

    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(28, 574, "READY PLAYER ONE | PROGRAM & DEPLOYMENT TOPOLOGY")
    c.setFillColor(BLUE)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(764, 552, "EXECUTIVE TECHNICAL OVERVIEW  /  PRINTABLE ONE-PAGE BRIEF")
    c.setStrokeColor(BLUE)
    c.setLineWidth(2)
    c.line(28, 544, 764, 544)

    # Section 1: a single left-to-right topology with no crossing connectors.
    c.setFillColor(CYAN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(28, 526, "1  CONTROL CENTER AND MANAGED MACHINE ESTATE")
    rounded_box(c, 28, 354, 224, 152, "READY PLAYER ONE", [
        "- Control plane for the managed estate",
        "- Discovers and identifies machines",
        "- Maintains console / game inventory",
        "- Queues ROM, cover, BIOS and settings work",
        "- Tracks progress, recovery and soft reset",
        "- Orchestrates RP2 without taking disk privilege",
    ], BLUE, 14, 7.5)
    rounded_box(c, 28, 276, 224, 62, "LOCAL CONTENT WAREHOUSE", [
        "- ROMs and covers",
        "- BIOS / firmware / keys and OS images"
    ], MAGENTA, 9, 6.8)
    arrow(c, 140, 338, 140, 354, MAGENTA, "SOURCE", label_dx=27)

    arrow(c, 252, 430, 292, 430, BLUE)
    c.setFillColor(BLUE)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(306, 514, "MANAGED DESTINATIONS OVER THE TRUSTED LAN")

    machines = [
        (306, 422, 210, 84, "BATOCERA", ["SSH / SFTP", "ROMs, covers, BIOS and settings", "Boot FAT32; userdata ext4 default"], GREEN, "mini"),
        (538, 422, 226, 84, "WINDOWS + READY PLAYER TWO", ["Authenticated RP2 agent", "Drive / boot inspection and execution", "Privileged work remains local"], RED, "laptop"),
        (306, 310, 210, 84, "RECALBOX", ["SSH / network access", "Library deployment and refresh", "Machine-specific behavior"], YELLOW, "mini"),
        (538, 310, 226, 84, "RETROBAT / WINDOWS", ["Windows share and discovery", "Managed ROM inventory", "No disk changes without RP2"], MAGENTA, "laptop"),
    ]
    for x, y, w, h, title, lines, color, kind in machines:
        machine_box(c, x, y, w, h, title, lines, color, kind)

    # Section 2: explicit numbered operating sequence.
    c.setFillColor(CYAN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(28, 253, "2  STANDARD OPERATING FLOW")
    steps = [
        ("01", "DISCOVER", "Identity + platform"),
        ("02", "AUTHENTICATE", "Per-machine access"),
        ("03", "PLAN", "Scope + safety checks"),
        ("04", "TRANSFER", "ROM then cover"),
        ("05", "VERIFY", "Inventory + refresh"),
    ]
    step_x = 28
    for index, (number, title, detail) in enumerate(steps):
        c.setFillColor(PANEL_2)
        c.setStrokeColor(BLUE)
        c.roundRect(step_x, 201, 132, 40, 6, fill=1, stroke=1)
        c.setFillColor(BLUE)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(step_x + 8, 218, number)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(step_x + 34, 222, title)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 5.8)
        c.drawString(step_x + 34, 211, detail)
        if index < len(steps) - 1:
            arrow(c, step_x + 132, 221, step_x + 146, 221, BLUE)
        step_x += 148

    # Section 3: actual RP2 shared-drive implementation and filesystems.
    c.setFillColor(CYAN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(28, 180, "3  READY PLAYER TWO - SHARED DUAL BOOT DISK TRANSFORMATION")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.5)
    c.drawString(28, 169, "RP1 sends the verified plan; RP2 performs elevated partition and boot work locally, then writes a persistent installation journal.")

    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(28, 145, "BEFORE")
    disk_segment(c, 83, 126, 42, 32, "EFI", "FAT32", HexColor("#56667d"))
    disk_segment(c, 125, 126, 551, 32, "WINDOWS 11 (C:)", "NTFS - existing installation", HexColor("#2b67a8"))
    disk_segment(c, 676, 126, 88, 32, "RECOVERY", "WinRE", HexColor("#56667d"))

    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(28, 94, "AFTER")
    disk_segment(c, 83, 75, 54, 32, "EFI", "FAT32 + rEFInd", HexColor("#56667d"))
    disk_segment(c, 137, 75, 285, 32, "WINDOWS 11", "NTFS - retained size", HexColor("#2b67a8"))
    disk_segment(c, 422, 75, 100, 32, "BATOCERA", "FAT32 - fixed 10 GB", HexColor("#c45757"))
    disk_segment(c, 522, 75, 164, 32, "SHARE", "exFAT - games + userdata", HexColor("#3f9160"))
    disk_segment(c, 686, 75, 78, 32, "RECOVERY", "WinRE", HexColor("#56667d"))

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.2)
    c.drawString(83, 58, "Batocera standard installations commonly use a FAT32 boot partition plus a Linux userdata filesystem (often ext4). RP2 shared dual boot intentionally creates FAT32 BATOCERA + exFAT SHARE for Windows/Batocera access.")
    c.drawString(28, 37, "SAFETY GATES: backup confirmation  |  recovery media  |  UEFI/GPT + BitLocker checks  |  image verification  |  partition preflight  |  installation journal")
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawRightString(764, 37, "READY PLAYER ONE  |  ARCHITECTURE BRIEF")

    c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
