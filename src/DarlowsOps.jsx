import { useState, useEffect, useMemo, useCallback } from "react";

// ─── Data ────────────────────────────────────────────────────

const POSITIONS = [
  { id: "opening-manager", label: "Opening Manager", icon: "⊛", div: "mgmt" },
  { id: "closing-manager", label: "Closing Manager", icon: "⊛", div: "mgmt" },
  { id: "cashier", label: "Cashier", icon: "◎", div: "grocery" },
  { id: "grocery-stocker", label: "Grocery Stocker", icon: "◎", div: "grocery" },
  { id: "deli-clerk", label: "Deli Clerk", icon: "◎", div: "grocery" },
  { id: "produce-clerk", label: "Produce Clerk", icon: "◎", div: "grocery" },
  { id: "hw-associate", label: "Hardware Associate", icon: "◆", div: "hardware" },
  { id: "hw-stocker", label: "Hardware Stocker", icon: "◆", div: "hardware" },
];

const POS_MAP = Object.fromEntries(POSITIONS.map(p => [p.id, p]));

const SOPS = {
  "opening-manager": [
    {
      title: "Store Opening SOP",
      steps: [
        "Arrive 30 min before open. Disarm alarm.",
        "Walk entire store — check for safety hazards or overnight issues.",
        "Verify safe counts match closing manager report. Document discrepancies.",
        "Unlock registers, verify cash drawers are correct per till sheet.",
        "Confirm delivery schedule for the day. Check cooler/freezer temps (log in temp sheet).",
        "Brief opening team at register — review daily priorities and staff assignments.",
        "Unlock front doors at scheduled open time. Enable POS system.",
        "Verify all deli/produce staff are prepped and cases are stocked.",
      ],
    },
    {
      title: "Safe Count Procedure",
      steps: [
        "Count safe twice independently before recording.",
        "Record total on the Daily Cash Report form.",
        "Compare to prior closing manager's logged total.",
        "Any variance over $5 must be flagged to store owner immediately.",
        "Sign and date the form. File in the safe count binder.",
      ],
    },
  ],
  "closing-manager": [
    {
      title: "Store Closing SOP",
      steps: [
        "Begin closing announcements 15 min before close.",
        "Lock front doors at close time. Complete final customer transactions.",
        "Pull all register tills. Count each drawer with a second employee witness.",
        "Log all till totals on Daily Cash Report. Prepare bank deposit.",
        "Ensure all deli, produce, and cold cases are properly covered/stored.",
        "Walk entire store — lights off, coolers checked, back door secured.",
        "Set alarm. Lock all entry points. Drop deposit bag in safe.",
        "Text or log closing notes to opening manager for next morning.",
      ],
    },
    {
      title: "Bank Deposit Procedure",
      steps: [
        "Count cash and checks. Record totals on deposit slip.",
        "Second employee must verify totals before bag is sealed.",
        "Seal deposit bag and log bag serial number on Daily Cash Report.",
        "Store in locked safe overnight. Never leave deposit in vehicle unattended.",
        "Opening manager confirms drop the following morning.",
      ],
    },
  ],
  "cashier": [
    {
      title: "Register Opening SOP",
      steps: [
        "Count till — verify $200 starting cash (or amount per manager instruction).",
        "Log into POS with your individual employee ID.",
        "Verify receipt paper is loaded. Test print a receipt.",
        "Check that scanner, scale, and card reader are functioning.",
        "Report any issues to the manager before opening.",
      ],
    },
    {
      title: "Customer Service Standards",
      steps: [
        "Greet every customer as they approach: 'Hi, how are you today?'",
        "Scan all items before placing in bag.",
        "For WIC/EBT: verify approved items. Call manager for any question.",
        "Offer bags and ask about rewards card on every transaction.",
        "Thank customer by name if visible on card: 'Thank you, have a great day!'",
        "Never leave register unattended without calling for coverage.",
      ],
    },
    {
      title: "Register Closing SOP",
      steps: [
        "Run end-of-day report from POS before removing till.",
        "Count till down with manager present.",
        "Place remaining cash in till envelope — record total on front.",
        "Log off POS. Clear any items left at register.",
        "Wipe down register, belt, and scanner with sanitizing cloth.",
      ],
    },
  ],
  "grocery-stocker": [
    {
      title: "Receiving & Stocking SOP",
      steps: [
        "Check in all deliveries against the invoice — count cases, note damages.",
        "Sign invoice only after count is confirmed. Refuse damaged/frozen goods.",
        "Rotate stock: pull forward, stock from back (FIFO).",
        "Check expiration dates on all product being shelved. Pull expired items.",
        "Face shelves — product pulled to front edge, labels forward.",
        "Log any out-of-stocks in the OOS book at the backroom desk.",
        "Break down cardboard and place in compactor. Never leave on sales floor.",
      ],
    },
    {
      title: "URM Invoice Check Procedure",
      steps: [
        "Match packing list to PO in the system.",
        "Log any shorts or substitutions on the shortage claim form.",
        "Take photos of any damaged cases before accepting or refusing.",
        "Submit shortage claims by end of business day of delivery.",
        "File original invoice in the accounts payable binder.",
      ],
    },
  ],
  "deli-clerk": [
    {
      title: "Deli Opening SOP",
      steps: [
        "Wash hands. Put on gloves before handling any food product.",
        "Check and log cooler temp — must be 41°F or below. Alert manager if not.",
        "Inspect all product in case — discard anything past pull date.",
        "Clean and sanitize slicer, prep surfaces, and display case glass.",
        "Set up hot case — preheat to proper holding temp before placing food.",
        "Prepare daily specials per manager's prep list.",
        "Have case fully stocked and ready 10 min before store opens.",
      ],
    },
    {
      title: "Food Safety & Temperature Log",
      steps: [
        "Log cooler temps at open, midday, and close — every day.",
        "Hot held food must stay at 135°F or above. Check every 2 hours.",
        "Cold held food must stay at 41°F or below.",
        "If any temp is out of range: alert manager immediately. Do not serve product.",
        "Complete WA State temp log form daily. File in food safety binder.",
      ],
    },
    {
      title: "Deli Closing SOP",
      steps: [
        "Pull all product from hot case. Cool rapidly. Label with date and time.",
        "Wrap and date all sliced meats and cheeses in cooler.",
        "Clean and sanitize all surfaces, slicer (full breakdown), and display case.",
        "Mop deli floor with sanitizing solution.",
        "Turn off hot case and warming equipment. Log final temps.",
        "Cover all cooler product. Verify cooler door is sealed.",
      ],
    },
  ],
  "produce-clerk": [
    {
      title: "Produce Department Opening SOP",
      steps: [
        "Inspect all produce in case and cooler — pull anything soft, moldy, or past prime.",
        "Mist wet rack items. Ensure display is full and visually appealing.",
        "Check and log cooler temp (35-40°F for most produce).",
        "Rotate product: older stock forward, new stock behind.",
        "Check for delivery — receive and break down produce boxes promptly.",
        "Ensure produce scale is calibrated and PLU book is current.",
      ],
    },
    {
      title: "Shrink & Quality Control",
      steps: [
        "Pull items at first sign of deterioration — do not wait until unsellable.",
        "Log all pulled product in the shrink log with item, quantity, and reason.",
        "Manager reviews shrink log weekly.",
        "Damaged items must be removed from sales floor immediately.",
        "Overstock cooler to prevent gaps — full cases beat sparse displays.",
      ],
    },
  ],
  "hw-associate": [
    {
      title: "Hardware Customer Service SOP",
      steps: [
        "Greet every customer entering the hardware section within 30 seconds.",
        "Ask open-ended questions to understand the project: 'What are you working on?'",
        "Walk customer to the product — don't just point.",
        "If you don't know an answer, say so and find someone who does. Never guess.",
        "Suggest related items that may be needed for the project.",
        "Follow up before customer leaves department: 'Do you have everything you need?'",
      ],
    },
    {
      title: "Special Order Procedure",
      steps: [
        "Get customer name, phone, and item details (brand, SKU, description).",
        "Check distributor catalog or call rep to confirm availability and lead time.",
        "Collect 50% deposit before placing order.",
        "Log order in special order book: date, customer, item, ETA, deposit amount.",
        "Call customer when order arrives. Hold for 14 days before restocking.",
        "Complete sale at pickup — collect remaining balance.",
      ],
    },
  ],
  "hw-stocker": [
    {
      title: "Hardware Receiving SOP",
      steps: [
        "Verify shipment against packing list. Note any shorts or damages.",
        "Tag damaged product immediately — do not put on shelf.",
        "Price all product before shelving — check against current retail sheet.",
        "Stock product in correct location per planogram.",
        "Face and front all shelves in your assigned section after stocking.",
        "Break down boxes and remove from sales floor immediately.",
        "Log restocking notes for buyer if items are consistently short.",
      ],
    },
  ],
};

const DAILY_CHECKLISTS = {
  "opening-manager": {
    label: "Opening Manager Daily Checklist",
    sections: [
      { name: "Before Open", tasks: ["Arrive 30 min before open", "Disarm alarm & do safety walk", "Check cooler/freezer temps", "Count safe & verify cash drawers", "Review delivery schedule", "Brief opening team"] },
      { name: "At Open", tasks: ["Unlock front doors", "Enable POS system", "Verify deli & produce are ready", "Check bathrooms"] },
      { name: "Mid-Morning", tasks: ["Review any delivery exceptions", "Check in with department leads", "Review prior day's sales report", "Address any staffing issues"] },
    ],
  },
  "closing-manager": {
    label: "Closing Manager Daily Checklist",
    sections: [
      { name: "Pre-Close", tasks: ["Make closing announcements at -15 min", "Begin register pull process", "Verify all departments are cleaning up"] },
      { name: "Close", tasks: ["Lock front doors", "Count all register tills", "Complete Daily Cash Report", "Prepare bank deposit"] },
      { name: "Final Walkthrough", tasks: ["All lights off (except security)", "Coolers & freezers secured", "Back door locked", "Alarm set", "Log closing notes for opener"] },
    ],
  },
  "cashier": {
    label: "Cashier Daily Checklist",
    sections: [
      { name: "Opening", tasks: ["Count till & verify starting cash", "Log into POS with employee ID", "Test scanner, scale, card reader", "Check receipt paper"] },
      { name: "During Shift", tasks: ["Greet every customer", "Offer bags & rewards card on every transaction", "Keep lane clean & belt sanitized", "Call manager for WIC/EBT questions"] },
      { name: "Closing", tasks: ["Run end-of-day POS report", "Count till with manager", "Log off POS", "Wipe down register & belt"] },
    ],
  },
  "grocery-stocker": {
    label: "Grocery Stocker Daily Checklist",
    sections: [
      { name: "Receiving", tasks: ["Check in delivery vs. invoice", "Document any shorts or damages", "Refuse damaged/frozen goods"] },
      { name: "Stocking", tasks: ["Rotate FIFO on all product", "Check expiration dates", "Face shelves — labels forward", "Break down cardboard to compactor"] },
      { name: "End of Shift", tasks: ["Log all out-of-stocks in OOS book", "Submit shortage claims if applicable", "File invoice in AP binder", "Clean up backroom"] },
    ],
  },
  "deli-clerk": {
    label: "Deli Clerk Daily Checklist",
    sections: [
      { name: "Opening", tasks: ["Wash hands & gloves on", "Log cooler temp (≤41°F)", "Inspect & pull expired product", "Sanitize slicer & prep surfaces", "Preheat hot case", "Prep daily specials"] },
      { name: "During Shift", tasks: ["Log temps at midday", "Rotate product in case", "Keep surfaces clean & sanitized", "Restock as needed"] },
      { name: "Closing", tasks: ["Pull hot case product & cool rapidly", "Label all sliced meats/cheeses with date", "Full slicer breakdown & sanitize", "Log final temps", "Mop deli floor", "Cover all cooler product"] },
    ],
  },
  "produce-clerk": {
    label: "Produce Clerk Daily Checklist",
    sections: [
      { name: "Opening", tasks: ["Inspect & pull deteriorating product", "Log cooler temp (35-40°F)", "Mist wet rack items", "Rotate product (older to front)"] },
      { name: "During Shift", tasks: ["Receive & break down produce delivery", "Log shrink in shrink log", "Keep displays full & faced", "Remove damaged items immediately"] },
      { name: "Closing", tasks: ["Final pull of any deteriorating product", "Mist and cover wet rack", "Log final shrink", "Sweep produce area"] },
    ],
  },
  "hw-associate": {
    label: "Hardware Associate Daily Checklist",
    sections: [
      { name: "Opening", tasks: ["Verify department is clean & faced", "Check for any special orders to notify", "Review any sale tags or price changes"] },
      { name: "During Shift", tasks: ["Greet customers within 30 seconds", "Walk customers to product — don't just point", "Suggest add-on items", "Log any special order requests"] },
      { name: "Closing", tasks: ["Face & front entire section", "Remove any misplaced items", "Log any out-of-stocks", "Secure special order area"] },
    ],
  },
  "hw-stocker": {
    label: "Hardware Stocker Daily Checklist",
    sections: [
      { name: "Receiving", tasks: ["Verify shipment vs. packing list", "Tag damaged product — do not shelf", "Price product before shelving"] },
      { name: "Stocking", tasks: ["Stock per planogram location", "Face & front after each section", "Remove boxes from sales floor immediately"] },
      { name: "End of Shift", tasks: ["Log restocking notes for buyer", "Complete OOS log", "Break area clean & organized"] },
    ],
  },
};

// ─── Constants ───────────────────────────────────────────────

const STATUS_OPTIONS = ["Open", "In Progress", "Completed"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const TABS = ["Tasks & Checklists", "SOPs", "Positions"];

const STATUS_COLORS = {
  Open: { bg: "#FFF3E0", text: "#E65100", dot: "#FF6D00" },
  "In Progress": { bg: "#E3F2FD", text: "#1565C0", dot: "#1976D2" },
  Completed: { bg: "#E8F5E9", text: "#2E7D32", dot: "#43A047" },
};

const PRIORITY_COLORS = {
  High: { bg: "#FCE4EC", text: "#B71C1C" },
  Medium: { bg: "#FFF8E1", text: "#E65100" },
  Low: { bg: "#F3E5F5", text: "#6A1B9A" },
};

const DIV_COLORS = {
  grocery: { bg: "#E8F5E9", text: "#2E7D32", label: "Grocery" },
  hardware: { bg: "#E3F2FD", text: "#1565C0", label: "Hardware" },
  mgmt: { bg: "#F3E5F5", text: "#6A1B9A", label: "Management" },
};

const POSITION_GROUPS = [
  { label: "Management", items: POSITIONS.filter(p => p.div === "mgmt") },
  { label: "Grocery", items: POSITIONS.filter(p => p.div === "grocery") },
  { label: "Hardware", items: POSITIONS.filter(p => p.div === "hardware") },
];

// ─── Helpers ─────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadDayState() {
  try {
    const raw = localStorage.getItem("darlows-ops");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed.date === todayKey() ? (parsed.tasks || {}) : {};
  } catch {
    return {};
  }
}

function saveDayState(tasks) {
  try {
    localStorage.setItem("darlows-ops", JSON.stringify({ date: todayKey(), tasks }));
  } catch { /* quota exceeded */ }
}

const HIGH_RE = /alarm|safe|deposit|temp|wash hands|lock|expired|hazard|sanitize|food safety|wic|ebt/i;
const MED_RE = /clean|verify|check|count|inspect|log|stock|brief|review|rotate|invoice|pull|mist|face|prep/i;

function derivePriority(text) {
  if (HIGH_RE.test(text)) return "High";
  if (MED_RE.test(text)) return "Medium";
  return "Low";
}

// ─── Small Components ────────────────────────────────────────

function Badge({ bg, text, children, dot }) {
  return (
    <span style={{ background: bg, color: text, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, display: "inline-block" }} />}
      {children}
    </span>
  );
}

function PriorityBars({ priority }) {
  const n = priority === "High" ? 3 : priority === "Medium" ? 2 : 1;
  const color = priority === "High" ? "#E53935" : priority === "Medium" ? "#FB8C00" : "#8E24AA";
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "flex-end" }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{ width: 4, height: 6 + i * 3, background: i <= n ? color : "#E0E0E0", borderRadius: 2, display: "inline-block" }} />
      ))}
    </span>
  );
}

function ProgressBar({ done, total, height = 5 }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ background: "#F0F0ED", borderRadius: 4, height, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, background: pct === 100 ? "#43A047" : "#1C1C1E", height: "100%", borderRadius: 4, transition: "width .3s" }} />
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <span style={{ position: "absolute", left: 10, fontSize: 13, color: "#AAA", pointerEvents: "none" }}>&#x1F50D;</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: "6px 10px 6px 30px", borderRadius: 6, border: "1px solid #E0E0E0", fontSize: 13, width: 200, fontFamily: "inherit", background: "#F8F8F6", outline: "none" }}
      />
      {value && (
        <button onClick={() => onChange("")} style={{ position: "absolute", right: 8, background: "none", border: "none", cursor: "pointer", color: "#AAA", fontSize: 14, padding: 0, lineHeight: 1 }}>&times;</button>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function DarlowsOps() {
  const [activeTab, setActiveTab] = useState("Tasks & Checklists");
  const [selectedPosition, setSelectedPosition] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedSOP, setSelectedSOP] = useState(null);
  const [taskStatuses, setTaskStatuses] = useState(loadDayState);
  const [view, setView] = useState("checklist");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => { saveDayState(taskStatuses); }, [taskStatuses]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setSelectedTask(null);
        setSelectedSOP(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const allTasks = useMemo(() =>
    Object.entries(DAILY_CHECKLISTS).flatMap(([posId, cl]) =>
      cl.sections.flatMap((sec, si) =>
        sec.tasks.map((task, ti) => {
          const id = `${posId}-${si}-${ti}`;
          const pos = POS_MAP[posId];
          return {
            id, posId, section: sec.name, task,
            status: taskStatuses[id] || "Open",
            priority: derivePriority(task),
            position: pos?.label || posId,
            div: pos?.div || "grocery",
          };
        })
      )
    ), [taskStatuses]
  );

  const filteredTasks = useMemo(() => {
    let tasks = selectedPosition === "all" ? allTasks : allTasks.filter(t => t.posId === selectedPosition);
    if (search) {
      const q = search.toLowerCase();
      tasks = tasks.filter(t => t.task.toLowerCase().includes(q) || t.position.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      tasks = tasks.filter(t => t.status === statusFilter);
    }
    return tasks;
  }, [allTasks, selectedPosition, search, statusFilter]);

  const filteredSops = useMemo(() => {
    const sops = selectedPosition === "all"
      ? Object.entries(SOPS).flatMap(([posId, arr]) =>
          arr.map((s, i) => ({ ...s, posId, id: `${posId}-${i}`, position: POS_MAP[posId]?.label }))
        )
      : (SOPS[selectedPosition] || []).map((s, i) => ({
          ...s, posId: selectedPosition, id: `${selectedPosition}-${i}`, position: POS_MAP[selectedPosition]?.label,
        }));
    if (!search) return sops;
    const q = search.toLowerCase();
    return sops.filter(s => s.title.toLowerCase().includes(q) || s.steps.some(st => st.toLowerCase().includes(q)));
  }, [selectedPosition, search]);

  const checklist = selectedPosition !== "all" ? DAILY_CHECKLISTS[selectedPosition] : null;

  const toggleComplete = useCallback((id) => {
    setTaskStatuses(prev => {
      const cur = prev[id] || "Open";
      return { ...prev, [id]: cur === "Completed" ? "Open" : "Completed" };
    });
  }, []);

  const setStatus = useCallback((id, status) => {
    setTaskStatuses(prev => ({ ...prev, [id]: status }));
  }, []);

  const resetDay = useCallback(() => {
    setTaskStatuses({});
    setSelectedTask(null);
  }, []);

  const globalStats = useMemo(() => {
    const total = allTasks.length;
    const done = allTasks.filter(t => t.status === "Completed").length;
    const inProgress = allTasks.filter(t => t.status === "In Progress").length;
    return { total, done, inProgress, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [allTasks]);

  const selectPosition = (posId) => {
    setSelectedPosition(posId);
    setSelectedTask(null);
    setSelectedSOP(null);
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#F5F4F0", color: "#1A1A1A", overflow: "hidden" }}>

      {/* ─── Sidebar ─── */}
      <div style={{ width: sidebarCollapsed ? 56 : 230, minWidth: sidebarCollapsed ? 56 : 230, background: "#1C1C1E", color: "#fff", display: "flex", flexDirection: "column", transition: "width .2s, min-width .2s", overflow: "hidden" }}>
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid #2C2C2E", display: "flex", alignItems: "center", gap: 10 }}>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.3px", lineHeight: 1 }}>DARLOW&apos;S</div>
              <div style={{ fontSize: 9, color: "#888", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>Operations</div>
            </div>
          )}
          {sidebarCollapsed && <div style={{ fontWeight: 800, fontSize: 13 }}>D</div>}
          <button onClick={() => setSidebarCollapsed(c => !c)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 14, padding: 4 }}>
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>

        <div style={{ padding: "10px 0", flex: 1, overflowY: "auto" }}>
          {!sidebarCollapsed && (
            <>
              <SidebarItem
                active={selectedPosition === "all"}
                onClick={() => selectPosition("all")}
                icon="◈"
                label="All Positions"
              />
              {POSITION_GROUPS.map(group => (
                <div key={group.label}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 2, padding: "12px 16px 4px" }}>{group.label}</div>
                  {group.items.map(pos => {
                    const cl = DAILY_CHECKLISTS[pos.id];
                    const total = cl ? cl.sections.reduce((a, s) => a + s.tasks.length, 0) : 0;
                    const done = cl ? cl.sections.reduce((a, s, si) =>
                      a + s.tasks.filter((_, ti) => taskStatuses[`${pos.id}-${si}-${ti}`] === "Completed").length, 0) : 0;
                    return (
                      <SidebarItem
                        key={pos.id}
                        active={selectedPosition === pos.id}
                        onClick={() => selectPosition(pos.id)}
                        icon={pos.icon}
                        label={pos.label}
                        count={total > 0 ? `${done}/${total}` : undefined}
                      />
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        {!sidebarCollapsed && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #2C2C2E" }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Darlow&apos;s Quality Foods &middot; Ops v1.0</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ProgressBar done={globalStats.done} total={globalStats.total} height={4} />
              <span style={{ fontSize: 10, color: "#888", whiteSpace: "nowrap" }}>{globalStats.pct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Main Content ─── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top Bar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #E8E8E5", padding: "0 24px", display: "flex", alignItems: "center", gap: 6, height: 52 }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedTask(null); setSelectedSOP(null); setSearch(""); }}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: activeTab === tab ? "#1C1C1E" : "transparent", color: activeTab === tab ? "#fff" : "#666", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .15s" }}
            >
              {tab}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <SearchInput value={search} onChange={setSearch} placeholder={activeTab === "SOPs" ? "Search SOPs..." : "Search tasks..."} />
            {activeTab === "Tasks & Checklists" && (
              <>
                <div style={{ display: "flex", background: "#F5F4F0", borderRadius: 6, padding: 2, gap: 2 }}>
                  {[["checklist", "By Position"], ["tasks", "All Tasks"]].map(([v, lbl]) => (
                    <button key={v} onClick={() => setView(v)} style={{ padding: "4px 12px", borderRadius: 5, border: "none", background: view === v ? "#fff" : "transparent", color: view === v ? "#1C1C1E" : "#888", fontWeight: 600, fontSize: 12, cursor: "pointer", boxShadow: view === v ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {view === "tasks" && (
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid #E0E0E0", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#F8F8F6" }}>
                    <option value="all">All Statuses</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </>
            )}
            <button onClick={resetDay} title="Reset all tasks for today" style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E0E0E0", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#999" }}>
              Reset Day
            </button>
            <div style={{ fontSize: 12, color: "#999", fontWeight: 500 }}>
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── TASKS & CHECKLISTS ── */}
          {activeTab === "Tasks & Checklists" && (
            <>
              <div style={{ flex: selectedTask ? "0 0 55%" : "1", overflowY: "auto", padding: "20px 24px" }}>
                {view === "checklist" && checklist ? (
                  <ChecklistView
                    checklist={checklist}
                    posId={selectedPosition}
                    taskStatuses={taskStatuses}
                    selectedTask={selectedTask}
                    onSelectTask={setSelectedTask}
                    onToggle={toggleComplete}
                    search={search}
                  />
                ) : view === "checklist" ? (
                  <AllPositionsGrid
                    taskStatuses={taskStatuses}
                    onSelectPosition={selectPosition}
                  />
                ) : (
                  <TaskTableView
                    tasks={filteredTasks}
                    selectedTask={selectedTask}
                    onSelectTask={setSelectedTask}
                    selectedPosition={selectedPosition}
                  />
                )}
              </div>

              {selectedTask && (
                <TaskDetailPanel
                  task={selectedTask}
                  status={taskStatuses[selectedTask.id] || "Open"}
                  onClose={() => setSelectedTask(null)}
                  onStatusChange={(s) => setStatus(selectedTask.id, s)}
                  onToggle={() => { toggleComplete(selectedTask.id); setSelectedTask(null); }}
                />
              )}
            </>
          )}

          {/* ── SOPs ── */}
          {activeTab === "SOPs" && (
            <>
              <div style={{ flex: selectedSOP ? "0 0 55%" : "1", overflowY: "auto", padding: "20px 24px" }}>
                <div style={{ marginBottom: 18 }}>
                  <h2 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>Standard Operating Procedures</h2>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                    {filteredSops.length} SOPs {selectedPosition !== "all" ? `for ${POS_MAP[selectedPosition]?.label}` : "across all positions"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredSops.map(sop => {
                    const pos = POS_MAP[sop.posId];
                    const divC = DIV_COLORS[pos?.div] || DIV_COLORS.grocery;
                    return (
                      <div
                        key={sop.id}
                        onClick={() => setSelectedSOP(sop)}
                        style={{ background: "#fff", borderRadius: 10, border: selectedSOP?.id === sop.id ? "1.5px solid #1C1C1E" : "1px solid #E8E8E5", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "box-shadow .15s" }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 3px 12px rgba(0,0,0,.07)"; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: divC.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{"📋"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{sop.title}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{sop.position} &middot; {sop.steps.length} steps</div>
                        </div>
                        <Badge bg={divC.bg} text={divC.text}>{divC.label}</Badge>
                      </div>
                    );
                  })}
                  {filteredSops.length === 0 && (
                    <div style={{ textAlign: "center", padding: 40, color: "#AAA", fontSize: 14 }}>No SOPs match your search.</div>
                  )}
                </div>
              </div>

              {selectedSOP && (
                <div style={{ width: 340, borderLeft: "1px solid #E8E8E5", background: "#fff", overflowY: "auto" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F0ED", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{selectedSOP.position}</div>
                      <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{selectedSOP.title}</div>
                    </div>
                    <button onClick={() => setSelectedSOP(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#BBB", padding: 0 }}>&times;</button>
                  </div>
                  <div style={{ padding: "16px 20px" }}>
                    <div style={{ fontSize: 11, color: "#AAA", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Steps</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {selectedSOP.steps.map((step, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1C1C1E", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                          <div style={{ fontSize: 13, lineHeight: 1.55, color: "#333", flex: 1 }}>{step}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── POSITIONS ── */}
          {activeTab === "Positions" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              <h2 style={{ fontWeight: 800, fontSize: 18, margin: "0 0 18px" }}>Position Directory</h2>
              {POSITION_GROUPS.map(group => (
                <div key={group.label} style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#999", marginBottom: 10 }}>{group.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {group.items.map(pos => {
                      const cl = DAILY_CHECKLISTS[pos.id];
                      const sops = SOPS[pos.id] || [];
                      const taskCount = cl ? cl.sections.reduce((a, s) => a + s.tasks.length, 0) : 0;
                      const divC = DIV_COLORS[pos.div] || DIV_COLORS.grocery;
                      return (
                        <div
                          key={pos.id}
                          onClick={() => { selectPosition(pos.id); setActiveTab("Tasks & Checklists"); }}
                          style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E8E5", padding: 18, cursor: "pointer" }}
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{pos.label}</div>
                            <Badge bg={divC.bg} text={divC.text}>{divC.label}</Badge>
                          </div>
                          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontWeight: 800, fontSize: 20, color: "#1C1C1E" }}>{taskCount}</div>
                              <div style={{ fontSize: 11, color: "#AAA" }}>Daily Tasks</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontWeight: 800, fontSize: 20, color: "#1C1C1E" }}>{sops.length}</div>
                              <div style={{ fontSize: 11, color: "#AAA" }}>SOPs</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-views ───────────────────────────────────────────────

function SidebarItem({ active, onClick, icon, label, count }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "7px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: active ? "#2C2C2E" : "transparent", borderRadius: 6, margin: "0 6px 1px", fontSize: 13, color: active ? "#fff" : "#AAA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
    >
      <span style={{ fontSize: 10, flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{label}</span>
      {count && <span style={{ fontSize: 10, color: "#666", flexShrink: 0 }}>{count}</span>}
    </div>
  );
}

function ChecklistView({ checklist, posId, taskStatuses, selectedTask, onSelectTask, onToggle, search }) {
  const total = checklist.sections.reduce((a, s) => a + s.tasks.length, 0);
  const done = checklist.sections.reduce((a, s, si) =>
    a + s.tasks.filter((_, ti) => taskStatuses[`${posId}-${si}-${ti}`] === "Completed").length, 0);
  const q = search?.toLowerCase() || "";

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>{checklist.label}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <div style={{ flex: 1, maxWidth: 220 }}>
            <ProgressBar done={done} total={total} height={6} />
          </div>
          <span style={{ fontSize: 12, color: done === total ? "#43A047" : "#999", fontWeight: 600 }}>
            {done}/{total} completed
          </span>
        </div>
      </div>
      {checklist.sections.map((sec, si) => {
        const tasks = q ? sec.tasks.filter(t => t.toLowerCase().includes(q)) : sec.tasks;
        if (tasks.length === 0) return null;
        return (
          <div key={si} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#999", marginBottom: 8 }}>{sec.name}</div>
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E8E8E5", overflow: "hidden" }}>
              {tasks.map((task) => {
                const ti = sec.tasks.indexOf(task);
                const id = `${posId}-${si}-${ti}`;
                const isDone = taskStatuses[id] === "Completed";
                const status = taskStatuses[id] || "Open";
                const priority = derivePriority(task);
                return (
                  <div
                    key={ti}
                    onClick={() => onSelectTask({ id, task, section: sec.name, posId, position: POS_MAP[posId]?.label, status, priority, div: POS_MAP[posId]?.div })}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: ti < sec.tasks.length - 1 ? "1px solid #F0F0ED" : "none", cursor: "pointer", background: selectedTask?.id === id ? "#F8F8F6" : "transparent", transition: "background .12s" }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={e => { e.stopPropagation(); onToggle(id); }}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#1C1C1E" }}
                    />
                    <span style={{ flex: 1, fontSize: 13, color: isDone ? "#AAA" : "#1A1A1A", textDecoration: isDone ? "line-through" : "none", fontWeight: isDone ? 400 : 500 }}>{task}</span>
                    <Badge {...STATUS_COLORS[status]} dot={STATUS_COLORS[status].dot}>{status}</Badge>
                    <PriorityBars priority={priority} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function AllPositionsGrid({ taskStatuses, onSelectPosition }) {
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>All Position Checklists</h2>
        <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Select a position to view its daily checklist</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {POSITIONS.map(pos => {
          const cl = DAILY_CHECKLISTS[pos.id];
          if (!cl) return null;
          const total = cl.sections.reduce((a, s) => a + s.tasks.length, 0);
          const done = cl.sections.reduce((a, s, si) =>
            a + s.tasks.filter((_, ti) => taskStatuses[`${pos.id}-${si}-${ti}`] === "Completed").length, 0);
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const divC = DIV_COLORS[pos.div] || DIV_COLORS.grocery;
          return (
            <div
              key={pos.id}
              onClick={() => onSelectPosition(pos.id)}
              style={{ background: "#fff", borderRadius: 10, border: "1px solid #E8E8E5", padding: 16, cursor: "pointer", transition: "box-shadow .15s" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{pos.label}</div>
                <Badge bg={divC.bg} text={divC.text}>{divC.label}</Badge>
              </div>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 10 }}>{total} tasks &middot; {done} done</div>
              <ProgressBar done={done} total={total} />
              <div style={{ fontSize: 11, color: pct === 100 ? "#43A047" : "#999", marginTop: 5, fontWeight: 600 }}>{pct}% complete</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TaskTableView({ tasks, selectedTask, onSelectTask, selectedPosition }) {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>All Tasks</h2>
        <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
          {tasks.length} tasks {selectedPosition !== "all" ? `for ${POS_MAP[selectedPosition]?.label}` : "across all positions"}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 90px 80px 80px", gap: 12, padding: "6px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#AAA", marginBottom: 4 }}>
        <span>Task</span><span>Position</span><span>Section</span><span>Status</span><span>Priority</span>
      </div>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E8E8E5", overflow: "hidden" }}>
        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#AAA", fontSize: 14 }}>No tasks match your filters.</div>
        )}
        {tasks.slice(0, 50).map((t, i) => (
          <div
            key={t.id}
            onClick={() => onSelectTask(t)}
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr 90px 80px 80px", gap: 12, padding: "10px 14px", borderBottom: i < Math.min(tasks.length, 50) - 1 ? "1px solid #F0F0ED" : "none", cursor: "pointer", alignItems: "center", background: selectedTask?.id === t.id ? "#F8F8F6" : "transparent" }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: t.status === "Completed" ? "#AAA" : "#1A1A1A", textDecoration: t.status === "Completed" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.task}</span>
            <span style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.position}</span>
            <span style={{ fontSize: 11, color: "#888" }}>{t.section}</span>
            <Badge {...STATUS_COLORS[t.status]} dot={STATUS_COLORS[t.status].dot}>{t.status}</Badge>
            <PriorityBars priority={t.priority} />
          </div>
        ))}
      </div>
    </>
  );
}

function TaskDetailPanel({ task, status, onClose, onStatusChange, onToggle }) {
  const priority = derivePriority(task.task);
  const divC = task.div ? DIV_COLORS[task.div] : null;
  return (
    <div style={{ width: 300, borderLeft: "1px solid #E8E8E5", background: "#fff", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F0ED", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{task.section}</div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{task.task}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#BBB", padding: 0, lineHeight: 1 }}>&times;</button>
      </div>
      <div style={{ padding: "16px 20px", flex: 1 }}>
        <DetailField label="Position">{task.position}</DetailField>
        <DetailField label="Status">
          <select
            value={status}
            onChange={e => onStatusChange(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E0E0E0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#F8F8F6" }}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </DetailField>
        <DetailField label="Priority"><Badge {...PRIORITY_COLORS[priority]}>{priority}</Badge></DetailField>
        {divC && <DetailField label="Division"><Badge bg={divC.bg} text={divC.text}>{divC.label}</Badge></DetailField>}
        <DetailField label="Notes">
          <textarea rows={3} placeholder="Add notes for this task..." style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #E8E8E5", fontSize: 13, resize: "none", fontFamily: "inherit", color: "#1A1A1A", boxSizing: "border-box" }} />
        </DetailField>
        <button
          onClick={onToggle}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: status === "Completed" ? "#E8F5E9" : "#1C1C1E", color: status === "Completed" ? "#2E7D32" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 8 }}
        >
          {status === "Completed" ? "✓ Completed — Mark Open" : "Mark Complete"}
        </button>
      </div>
    </div>
  );
}

function DetailField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#AAA", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{children}</div>
    </div>
  );
}
