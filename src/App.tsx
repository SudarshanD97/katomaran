import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const pipeline = [
  {
    id: "01",
    title: "Capture & Normalize",
    description:
      "Read the sample video file for development. During the interview, swap seamlessly to an RTSP camera stream. Frames are normalized to a consistent resolution before detection begins.",
    icon: "📹",
  },
  {
    id: "02",
    title: "Detect Faces with YOLO",
    description:
      "Run YOLOv8-face detector every N frames (configurable via config.json). The tracker handles in-between frames efficiently without re-running expensive detection.",
    icon: "🎯",
  },
  {
    id: "03",
    title: "Embed & Match Identity",
    description:
      "Crop each detected face, generate an InsightFace/ArcFace embedding, and compare against the registry using cosine similarity for accurate re-identification.",
    icon: "🧬",
  },
  {
    id: "04",
    title: "Track Continuously",
    description:
      "Use ByteTrack or DeepSORT to maintain stable track IDs across frames. This prevents duplicate registrations when the same person stays in view.",
    icon: "📍",
  },
  {
    id: "05",
    title: "Log Entry & Exit Once",
    description:
      "Write exactly one entry event when a new person appears and one exit event when the track is lost beyond the configured grace period.",
    icon: "✅",
  },
];

const techStack = [
  { name: "Face Detection", tech: "YOLOv8-face", color: "bg-blue-500" },
  { name: "Recognition", tech: "InsightFace / ArcFace", color: "bg-purple-500" },
  { name: "Tracking", tech: "ByteTrack / DeepSORT", color: "bg-green-500" },
  { name: "Backend", tech: "Python 3.10+", color: "bg-yellow-500" },
  { name: "Database", tech: "SQLite", color: "bg-red-500" },
  { name: "Config", tech: "JSON", color: "bg-indigo-500" },
];

const features = [
  {
    title: "Auto-Registration",
    description: "New faces are automatically assigned a unique visitor ID upon first detection.",
    icon: "👤",
  },
  {
    title: "Re-identification",
    description: "Known faces are recognized in subsequent frames without incrementing the count.",
    icon: "🔄",
  },
  {
    title: "Event Logging",
    description: "Every entry and exit generates a timestamped image and database record.",
    icon: "📝",
  },
  {
    title: "Unique Counting",
    description: "Accurate count of unique visitors, derived from the database or event logs.",
    icon: "📊",
  },
];

const sampleEvents = [
  { time: "11:58:02", type: "ENTRY", visitor: "V-014", detail: "New visitor registered" },
  { time: "11:58:07", type: "RECOGNIZED", visitor: "V-014", detail: "Similarity: 0.97" },
  { time: "11:58:18", type: "EXIT", visitor: "V-014", detail: "Track lost after 18 frames" },
];

const folderTree = `logs/
├── entries/
│   └── 2026-03-23/
│       ├── V-014_115802.jpg
│       └── V-021_115846.jpg
├── exits/
│   └── 2026-03-23/
│       └── V-014_115818.jpg
└── events.log

database/
└── visitors.sqlite`;

const schemaPreview = `CREATE TABLE visitor_events (
  id INTEGER PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  event_type TEXT CHECK(event_type IN ('entry', 'exit')),
  timestamp TEXT NOT NULL,
  track_id TEXT NOT NULL,
  image_path TEXT NOT NULL,
  embedding_hash TEXT,
  source TEXT,
  UNIQUE(event_type, visitor_id, timestamp)
);`;

function App() {
  const reduceMotion = useReducedMotion() ?? false;
  const [skipFrames, setSkipFrames] = useState(4);
  const [activeTab, setActiveTab] = useState<"overview" | "config" | "schema">("overview");

  const [sourceType, setSourceType] = useState<"file" | "url">("url");
  const [rtspUrl, setRtspUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");

  const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

  const normalizeBaseUrl = (v: string) => v.replace(/\/+$/, "");

  // Direct local pipeline: default to the backend running at localhost:7860.
  // If you want a different backend, set `VITE_API_URL`.
  const apiBaseUrl = normalizeBaseUrl(configuredApiUrl) || "http://localhost:7860";

  const handleSetSource = async () => {
    setIsSubmitting(true);
    setSourceMessage("");
    try {
      const url = apiBaseUrl;
      const formData = new FormData();
      if (sourceType === "file" && videoFile) {
        formData.append("file", videoFile);
      } else if (sourceType === "url" && rtspUrl) {
        formData.append("url", rtspUrl);
      } else {
        setSourceMessage("Please provide a valid input.");
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(`${url}/api/set-source`, {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        setSourceMessage(data.status === "success" ? "Pipeline connected and running!" : "Failed to connect.");
      } else {
        const body = await res.text().catch(() => "");
        const snippet = body ? ` - ${body.slice(0, 200)}` : "";
        setSourceMessage(`Error connecting to backend (${res.status})${snippet}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSourceMessage(`Network error. ${msg}`);
    }
    setIsSubmitting(false);
  };

  const frameRate = 30;
  const detectionPasses = useMemo(() => frameRate / (skipFrames + 1), [skipFrames]);
  const relativeLoad = useMemo(() => Math.max(18, Math.round(100 / (skipFrames + 1))), [skipFrames]);

  const configPreview = useMemo(
    () =>
      JSON.stringify(
        {
          input_source: "sample_video.mp4",
          rtsp_fallback: "rtsp://camera/stream",
          detection_skip_frames: skipFrames,
          detector: {
            model: "yolov8n-face.pt",
            confidence_threshold: 0.45,
            iou_threshold: 0.5,
          },
          recognizer: {
            model: "InsightFace / ArcFace",
            similarity_threshold: 0.42,
            register_on_first_seen: true,
          },
          tracker: {
            algorithm: "ByteTrack",
            max_lost_frames: 18,
          },
          storage: {
            db: "sqlite:///visitors.sqlite",
            logs_dir: "logs/",
          },
        },
        null,
        2
      ),
    [skipFrames]
  );

  const [stats, setStats] = useState({ unique_visitors: 0, currently_inside: 0, detection_rate: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/stats`);
        if (res.ok) {
          const data = await res.json();
          if (data.unique_visitors !== undefined) {
            setStats({
              unique_visitors: data.unique_visitors,
              currently_inside: data.currently_inside,
              detection_rate: data.detection_rate,
            });
          }
        }
      } catch {
        // Silently fail if backend is not running
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [apiBaseUrl]);

  return (
    <div className="bg-[#fbfbfd] text-[#1d1d1f]">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#fbfbfd]/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold">
              VT
            </div>
            <span className="text-sm font-semibold text-[#1d1d1f]">Visitor Tracker</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#1d1d1f]/60 md:flex">
            <a className="transition-colors hover:text-[#1d1d1f]" href="#features">Features</a>
            <a className="transition-colors hover:text-[#1d1d1f]" href="#pipeline">Pipeline</a>
            <a className="transition-colors hover:text-[#1d1d1f]" href="#implementation">Implementation</a>
            <a className="transition-colors hover:text-[#1d1d1f]" href="#architecture">Architecture</a>
          </nav>
          <a
            href="#implementation"
            className="hidden rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#1d1d1f]/80 sm:block"
          >
            View Details
          </a>
        </div>
      </header>

      <main id="top" className="overflow-hidden">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-transparent to-transparent" />
          <motion.div
            aria-hidden
            className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 opacity-60 blur-3xl"
            animate={reduceMotion ? undefined : { scale: [1, 1.1, 1], opacity: [0.6, 0.4, 0.6] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="absolute -left-20 top-40 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-100 to-blue-100 opacity-50 blur-3xl"
            animate={reduceMotion ? undefined : { scale: [1, 1.15, 1], opacity: [0.5, 0.3, 0.5] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pb-28 sm:pt-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-center"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                </span>
                Hackathon Submission
              </div>

              <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight text-[#1d1d1f] sm:text-6xl lg:text-7xl">
                Intelligent Face Tracker with{" "}
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Auto-Registration
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#1d1d1f]/60 sm:text-xl">
                A real-time pipeline that detects faces with YOLO, auto-registers visitors through InsightFace
                embeddings, tracks them with ByteTrack, and records exactly one entry and one exit per person.
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <a
                  href="#pipeline"
                  className="inline-flex items-center gap-2 rounded-full bg-[#1d1d1f] px-6 py-3 text-base font-medium text-white transition-all hover:bg-[#1d1d1f]/80 hover:scale-[1.02]"
                >
                  Explore Pipeline
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </a>
                <a
                  href="#implementation"
                  className="inline-flex items-center gap-2 rounded-full border border-[#1d1d1f]/15 bg-white px-6 py-3 text-base font-medium text-[#1d1d1f] transition-all hover:border-[#1d1d1f]/25 hover:bg-gray-50"
                >
                  View Implementation
                </a>
              </div>
            </motion.div>

            {/* Live Preview Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
              className="mx-auto mt-16 max-w-4xl"
            >
              <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-2xl shadow-black/5">
                <div className="flex items-center justify-between border-b border-black/5 bg-gradient-to-r from-gray-50 to-white px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-400"></div>
                      <div className="h-3 w-3 rounded-full bg-yellow-400"></div>
                      <div className="h-3 w-3 rounded-full bg-green-400"></div>
                    </div>
                    <span className="text-sm text-[#1d1d1f]/40">Live Stream Monitor</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#1d1d1f]/50">
                    <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                    Processing
                  </div>
                </div>

                <div className="grid md:grid-cols-[1fr_280px]">
                  {/* Source Configurator */}
                  <div className="relative aspect-video bg-gray-50 flex items-center justify-center overflow-hidden p-6 border-r border-black/5">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm border border-black/5">
                      <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">Pipeline Source</h3>
                      
                      <div className="flex rounded-lg bg-gray-100 p-1 mb-4">
                        <button
                          onClick={() => setSourceType("url")}
                          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
                            sourceType === "url" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          RTSP Link
                        </button>
                        <button
                          onClick={() => setSourceType("file")}
                          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
                            sourceType === "file" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          Video Upload
                        </button>
                      </div>

                      <div className="space-y-4">
                        {sourceType === "url" ? (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Camera Stream URL</label>
                            <input
                              type="text"
                              value={rtspUrl}
                              onChange={(e) => setRtspUrl(e.target.value)}
                              placeholder="rtsp://admin:pass@192.168.1.10..."
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Local MP4 File</label>
                            <input
                              type="file"
                              accept="video/mp4"
                              onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                              className="w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-600 hover:file:bg-blue-100"
                            />
                          </div>
                        )}

                        <button
                          disabled={isSubmitting}
                          onClick={handleSetSource}
                          className="w-full rounded-lg bg-[#1d1d1f] py-2 text-sm font-medium text-white transition-all hover:bg-[#1d1d1f]/80 disabled:opacity-50"
                        >
                          {isSubmitting ? "Connecting..." : "Launch Pipeline"}
                        </button>

                        {sourceMessage && (
                          <div className={`text-center text-xs font-medium ${sourceMessage.includes("Error") || sourceMessage.includes("Failed") || sourceMessage.includes("Please") ? "text-red-500" : "text-green-500"}`}>
                            {sourceMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats Panel */}
                  <div className="border-l border-black/5 bg-gradient-to-b from-gray-50/50 to-white p-6">
                    <div className="space-y-5">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-[#1d1d1f]/40">Unique Visitors</div>
                        <div className="mt-1 text-4xl font-semibold text-[#1d1d1f]">{stats.unique_visitors}</div>
                      </div>
                      <div className="h-px bg-black/5"></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wider text-[#1d1d1f]/40">Entries</div>
                          <div className="mt-1 text-2xl font-semibold text-green-600">-</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wider text-[#1d1d1f]/40">Exits</div>
                          <div className="mt-1 text-2xl font-semibold text-red-500">-</div>
                        </div>
                      </div>
                      <div className="h-px bg-black/5"></div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-[#1d1d1f]/40">Currently Inside</div>
                        <div className="mt-1 text-2xl font-semibold text-blue-600">{stats.currently_inside}</div>
                      </div>
                      <div className="h-px bg-black/5"></div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-[#1d1d1f]/40">Detection Rate</div>
                        <div className="mt-1 text-lg font-semibold text-[#1d1d1f]">{detectionPasses.toFixed(1)} fps</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="border-y border-black/5 bg-white py-12">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
              {techStack.map((item) => (
                <div key={item.name} className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${item.color}`}></div>
                  <div>
                    <span className="text-sm text-[#1d1d1f]/40">{item.name}:</span>{" "}
                    <span className="text-sm font-medium text-[#1d1d1f]">{item.tech}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <motion.section
          id="features"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, amount: 0.2 }}
          className="py-24"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center">
              <h2 className="text-4xl font-semibold tracking-tight text-[#1d1d1f] sm:text-5xl">
                Core Capabilities
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-[#1d1d1f]/60">
                Everything needed to accurately count unique visitors in real-time video streams.
              </p>
            </div>

            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="group rounded-2xl border border-black/5 bg-white p-6 transition-all hover:border-black/10 hover:shadow-xl hover:shadow-black/5"
                >
                  <div className="text-4xl">{feature.icon}</div>
                  <h3 className="mt-4 text-lg font-semibold text-[#1d1d1f]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#1d1d1f]/60">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Pipeline Section */}
        <motion.section
          id="pipeline"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, amount: 0.2 }}
          className="border-t border-black/5 bg-gradient-to-b from-gray-50 to-white py-24"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                Processing Pipeline
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#1d1d1f] sm:text-5xl">
                Frame-by-frame loop designed to avoid duplicate counts
              </h2>
              <p className="mt-4 text-lg text-[#1d1d1f]/60">
                The detector finds candidates on a schedule, the tracker maintains continuity, and the state machine decides when a visitor truly enters or exits.
              </p>
            </div>

            <div className="mt-14 space-y-4">
              {pipeline.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="group flex gap-6 rounded-2xl border border-black/5 bg-white p-6 transition-all hover:border-black/10 hover:shadow-lg hover:shadow-black/5"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 text-2xl group-hover:from-blue-50 group-hover:to-purple-50">
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-[#1d1d1f]/30">{step.id}</span>
                      <h3 className="text-xl font-semibold text-[#1d1d1f]">{step.title}</h3>
                    </div>
                    <p className="mt-2 text-[#1d1d1f]/60">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Code Preview */}
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#1d1d1f]">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500"></div>
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-500"></div>
                    <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                  </div>
                  <span className="text-xs text-white/40">pipeline.py</span>
                </div>
                <pre className="overflow-x-auto p-4 text-sm leading-6 text-white/80">
{`for frame in stream:
    if frame_index % detection_skip_frames == 0:
        detections = yolo_detect(frame)
        for face in detections:
            crop = crop_face(frame, face.box)
            embedding = insightface(crop)
            visitor = registry.match_or_register(embedding)
            tracker.associate(visitor, face.box)

    tracker.update(frame)
    for transition in tracker.transitions():
        logger.write_once(transition)
        database.persist(transition)`}
                </pre>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-6">
                <h4 className="font-semibold text-[#1d1d1f]">Key Design Principles</h4>
                <ul className="mt-4 space-y-3 text-sm text-[#1d1d1f]/70">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">✓</span>
                    Auto-register on first unknown detection and assign a visitor ID immediately.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">✓</span>
                    Store the first crop as the registration reference with embedding in DB.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">✓</span>
                    Use track-to-visitor mapping to prevent duplicate database rows.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">✓</span>
                    Confirm exit only after track stays lost past max_lost_frames.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Implementation Section */}
        <motion.section
          id="implementation"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, amount: 0.2 }}
          className="py-24"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600">
                Implementation Details
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#1d1d1f] sm:text-5xl">
                Configuration & Data Schema
              </h2>
              <p className="mt-4 text-lg text-[#1d1d1f]/60">
                The system is fully configurable through config.json and stores all events in a structured SQLite database.
              </p>
            </div>

            {/* Tabs */}
            <div className="mt-10 inline-flex rounded-xl border border-black/5 bg-gray-100 p-1">
              {(["overview", "config", "schema"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === tab
                      ? "bg-white text-[#1d1d1f] shadow-sm"
                      : "text-[#1d1d1f]/60 hover:text-[#1d1d1f]"
                  }`}
                >
                  {tab === "overview" && "Overview"}
                  {tab === "config" && "config.json"}
                  {tab === "schema" && "Database Schema"}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="mt-6">
              {activeTab === "overview" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Config Slider */}
                  <div className="rounded-2xl border border-black/5 bg-white p-6">
                    <h4 className="text-lg font-semibold text-[#1d1d1f]">Detection Skip Frames</h4>
                    <p className="mt-2 text-sm text-[#1d1d1f]/60">
                      Control how often the YOLO detector runs. Higher values reduce CPU load but may miss fast-moving faces.
                    </p>
                    <div className="mt-6">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[#1d1d1f]/60">Skip {skipFrames} frames</span>
                        <span className="font-medium text-[#1d1d1f]">{detectionPasses.toFixed(1)} detections/sec</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={skipFrames}
                        onChange={(e) => setSkipFrames(Number(e.target.value))}
                        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-500"
                      />
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-[#1d1d1f]/50">Detector Load</div>
                          <div className="mt-1 text-xl font-semibold text-[#1d1d1f]">{relativeLoad}%</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-[#1d1d1f]/50">Tracking Mode</div>
                          <div className="mt-1 text-xl font-semibold text-[#1d1d1f]">ByteTrack</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Event Log Preview */}
                  <div className="rounded-2xl border border-black/5 bg-white p-6">
                    <h4 className="text-lg font-semibold text-[#1d1d1f]">Event Log Sample</h4>
                    <p className="mt-2 text-sm text-[#1d1d1f]/60">
                      All events are written to events.log with structured metadata.
                    </p>
                    <div className="mt-6 space-y-3">
                      {sampleEvents.map((event, index) => (
                        <div
                          key={index}
                          className={`rounded-xl p-3 ${
                            event.type === "ENTRY" ? "bg-green-50" : event.type === "EXIT" ? "bg-red-50" : "bg-blue-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                                event.type === "ENTRY" ? "bg-green-500 text-white" : 
                                event.type === "EXIT" ? "bg-red-500 text-white" : "bg-blue-500 text-white"
                              }`}>
                                {event.type}
                              </span>
                              <span className="text-sm font-medium text-[#1d1d1f]">{event.visitor}</span>
                            </div>
                            <span className="text-xs text-[#1d1d1f]/50">{event.time}</span>
                          </div>
                          <p className="mt-1 text-xs text-[#1d1d1f]/60">{event.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "config" && (
                <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#1d1d1f]">
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500"></div>
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-500"></div>
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                    </div>
                    <span className="text-xs text-white/40">config.json</span>
                  </div>
                  <pre className="overflow-x-auto p-6 text-sm leading-6 text-white/80">{configPreview}</pre>
                </div>
              )}

              {activeTab === "schema" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#1d1d1f]">
                    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                      <div className="flex gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500"></div>
                        <div className="h-2.5 w-2.5 rounded-full bg-yellow-500"></div>
                        <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                      </div>
                      <span className="text-xs text-white/40">schema.sql</span>
                    </div>
                    <pre className="overflow-x-auto p-6 text-sm leading-6 text-white/80">{schemaPreview}</pre>
                  </div>
                  
                  <div className="rounded-2xl border border-black/5 bg-white p-6">
                    <h4 className="text-lg font-semibold text-[#1d1d1f]">Filesystem Structure</h4>
                    <pre className="mt-4 text-sm text-[#1d1d1f]/70">{folderTree}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* Architecture Section */}
        <motion.section
          id="architecture"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, amount: 0.2 }}
          className="border-t border-black/5 bg-gradient-to-b from-gray-50 to-white py-24"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-600">
                System Architecture
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#1d1d1f] sm:text-5xl">
                Complete Pipeline Overview
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-[#1d1d1f]/60">
                A linear flow from video ingest to unique visitor count output.
              </p>
            </div>

            <div className="mt-14">
              <ArchitectureDiagram />
            </div>

            {/* Compute Requirements */}
            <div className="mt-16 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-black/5 bg-white p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    💻
                  </div>
                  <h4 className="text-lg font-semibold text-[#1d1d1f]">CPU Mode</h4>
                </div>
                <p className="mt-3 text-sm text-[#1d1d1f]/60">
                  Best for low-resolution clips or demos. Use detection_skip_frames of 4-6 to keep the detector from dominating the pipeline. Suitable for development and testing.
                </p>
                <div className="mt-4 rounded-xl bg-gray-50 p-3">
                  <div className="text-xs font-medium text-[#1d1d1f]/50">Recommended Skip</div>
                  <div className="mt-1 text-xl font-semibold text-[#1d1d1f]">4-6 frames</div>
                </div>
              </div>
              
              <div className="rounded-2xl border border-black/5 bg-white p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600">
                    ⚡
                  </div>
                  <h4 className="text-lg font-semibold text-[#1d1d1f]">GPU Mode</h4>
                </div>
                <p className="mt-3 text-sm text-[#1d1d1f]/60">
                  Recommended for RTSP interview stream. YOLO and InsightFace run on CUDA while tracking and logging stay lightweight on CPU. Near real-time at standard resolutions.
                </p>
                <div className="mt-4 rounded-xl bg-gray-50 p-3">
                  <div className="text-xs font-medium text-[#1d1d1f]/50">Recommended Skip</div>
                  <div className="mt-1 text-xl font-semibold text-[#1d1d1f]">1-2 frames</div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>


      </main>

      {/* Footer */}
      <footer className="border-t border-black/5 bg-white py-12">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold">
              VT
            </div>
            <span className="text-sm font-semibold text-[#1d1d1f]">Visitor Tracker</span>
          </div>
          <p className="mt-4 text-sm text-[#1d1d1f]/50">
            Intelligent Face Tracking System for Unique Visitor Counting
          </p>
          <p className="mt-6 text-xs text-[#1d1d1f]/40">
            This project is a part of a hackathon run by{" "}
            <a href="https://katomaran.com" className="text-blue-500 hover:underline">
              https://katomaran.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function ArchitectureDiagram() {
  const nodes = [
    { id: 1, label: "Camera / RTSP", sublabel: "Video Input", x: 0 },
    { id: 2, label: "Frame Skipper", sublabel: "config.json", x: 1 },
    { id: 3, label: "YOLO Face", sublabel: "Detection", x: 2 },
    { id: 4, label: "InsightFace", sublabel: "Embeddings", x: 3 },
    { id: 5, label: "ByteTrack", sublabel: "Tracking", x: 4 },
    { id: 6, label: "Logger", sublabel: "DB + Files", x: 5 },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white p-8">
      <div className="flex min-w-[800px] items-center justify-between">
        {nodes.map((node, index) => (
          <div key={node.id} className="flex items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="flex flex-col items-center"
            >
              <div className="flex h-20 w-28 flex-col items-center justify-center rounded-2xl border border-black/10 bg-gradient-to-br from-gray-50 to-white p-4 shadow-lg shadow-black/5">
                <span className="text-sm font-semibold text-[#1d1d1f]">{node.label}</span>
                <span className="mt-1 text-xs text-[#1d1d1f]/50">{node.sublabel}</span>
              </div>
            </motion.div>
            {index < nodes.length - 1 && (
              <div className="flex w-12 items-center justify-center">
                <svg className="h-4 w-8 text-[#1d1d1f]/20" viewBox="0 0 32 16" fill="none">
                  <path d="M0 8h28m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Output */}
      <div className="mt-8 flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          viewport={{ once: true }}
          className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4 text-white shadow-xl"
        >
          <div className="text-3xl">📊</div>
          <div>
            <div className="font-semibold">Unique Visitor Count</div>
            <div className="text-sm text-white/80">Derived from DB or event logs</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default App;
