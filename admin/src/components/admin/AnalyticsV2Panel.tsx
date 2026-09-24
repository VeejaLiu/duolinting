import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
  Switch,
} from "antd";
import { apiClient } from "../../lib/apiClient";
import { useAdminLanguage } from "../../i18n/AdminLanguageProvider";
type Row = Record<string, unknown>;
type Report = {
  metadata: {
    timezone: string;
    isComplete: boolean;
    sampleSize: number;
    excludedCount: number;
    geoCoveragePercent: number | null;
    generatedAt: string;
    warnings: string[];
    trackingStartedAtByMetricAndClient: Row[];
  };
  data: Record<string, unknown>;
};
const day = (offset = 0) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const metricKeys = [
  "pageViews",
  "visitors",
  "registrations",
  "learningDau",
  "learningWau",
  "learningMau",
  "sustainedWeekly",
  "playMs",
  "learningUsers",
  "legacyAccessUsers",
];
export function AnalyticsV2Panel({ adminToken }: { adminToken: string }) {
  const { t } = useAdminLanguage();
  const [tab, setTab] = useState("overview");
  const [from, setFrom] = useState(day(-29));
  const [to, setTo] = useState(day());
  const [country, setCountry] = useState("");
  const [build, setBuild] = useState("");
  const [exercise, setExercise] = useState<number | null>(null);
  const [media, setMedia] = useState("");
  const [client, setClient] = useState("all");
  const [region, setRegion] = useState("all");
  const [cohort, setCohort] = useState("access");
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [traffic, setTraffic] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [internalId, setInternalId] = useState<number | null>(null);
  const [internal, setInternal] = useState(true);
  const query = new URLSearchParams({
    from,
    to,
    clientType: client,
    regionGroup: region,
    cohortType: cohort,
    ...(country ? { countryCode: country } : {}),
    ...(build ? { appBuild: build } : {}),
    ...(exercise ? { exerciseId: String(exercise) } : {}),
    ...(media ? { mediaType: media } : {}),
  }).toString();
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    setReport(null);
    void apiClient
      .getAnalyticsReport<Report>(tab, query, adminToken)
      .then((r) => {
        if (current) setReport(r);
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    if (tab === "media-quality")
      void apiClient
        .getAnalyticsReport<Report>("traffic", query, adminToken)
        .then((r) => {
          if (current) setTraffic(r);
        })
        .catch(() => {
          if (current) setTraffic(null);
        });
    return () => {
      current = false;
    };
  }, [tab, query, adminToken, refresh]);
  const show = (value: unknown): string =>
    value === null || value === undefined
      ? t("analytics.unavailable")
      : typeof value === "number"
        ? Number.isInteger(value)
          ? String(value)
          : value.toFixed(2)
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  const table = (values: unknown, key: string) => {
    const data = Array.isArray(values) ? (values as Row[]) : [];
    const keys = [...new Set(data.flatMap(Object.keys))];
    return (
      <Table
        key={key}
        size="small"
        scroll={{ x: true }}
        pagination={{ pageSize: 20 }}
        dataSource={data.map((r, i) => ({ ...r, key: i }))}
        columns={keys
          .filter((k) => !["cells", "cohortType", "smallSample"].includes(k))
          .map((k) => ({
            title: t("analytics." + k),
            dataIndex: k,
            render: show,
          }))}
      />
    );
  };
  const retention = report?.data.cohorts as
    | (Row & {
        windowRetention: {
          status: string;
          retained: number | null;
          denominator: number;
        };
        cells: {
          offset: number;
          status: string;
          retained: number | null;
          denominator: number;
          percent: number | null;
        }[];
      })[]
    | undefined;
  const exportCsv = async () => {
    try {
      await apiClient.downloadAnalyticsCsv(tab, query, adminToken);
    } catch {
      setError(true);
    }
  };
  return (
    <Card title={t("analytics.title")}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Space wrap>
          <Input
            type="date"
            aria-label={t("analytics.from")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ width: 155 }}
          />
          <Input
            type="date"
            aria-label={t("analytics.to")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: 155 }}
          />
          <Select
            value={client}
            onChange={setClient}
            style={{ width: 155 }}
            options={["all", "web_app", "mobile_web", "mobile_app"].map(
              (value) => ({ value, label: t("analytics." + value) }),
            )}
          />
          <Select
            value={region}
            onChange={setRegion}
            style={{ width: 170 }}
            options={["all", "mainland", "non_mainland", "unknown"].map(
              (value) => ({ value, label: t("analytics." + value) }),
            )}
          />
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            placeholder={t("analytics.countryFilter")}
            style={{ width: 180 }}
            maxLength={2}
          />
          {tab === "media-quality" && (
            <>
              <Input
                value={build}
                onChange={(e) => setBuild(e.target.value)}
                placeholder={t("analytics.appBuild")}
                style={{ width: 150 }}
              />
              <InputNumber
                value={exercise}
                min={1}
                onChange={setExercise}
                placeholder={t("analytics.exerciseId")}
              />
              <Select
                value={media}
                onChange={setMedia}
                style={{ width: 130 }}
                options={[
                  { value: "", label: t("analytics.all") },
                  { value: "audio", label: "Audio" },
                  { value: "video", label: "Video" },
                ]}
              />
            </>
          )}
          <Button onClick={() => setRefresh((v) => v + 1)} loading={loading}>
            {t("刷新")}
          </Button>
          <Button onClick={() => void exportCsv()} disabled={!report}>
            {t("analytics.export")}
          </Button>
        </Space>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={["overview", "retention", "geography", "media-quality"].map(
            (key) => ({ key, label: t("analytics." + key) }),
          )}
        />
        {error && (
          <Alert type="error" showIcon message={t("analytics.loadError")} />
        )}
        {report && (
          <>
            <Alert
              type={report.metadata.isComplete ? "info" : "warning"}
              showIcon
              message={t(
                report.metadata.isComplete
                  ? "analytics.complete"
                  : "analytics.incomplete",
              )}
              description={`${report.metadata.timezone} · ${t("analytics.sampleSize")}: ${report.metadata.sampleSize} · ${t("analytics.excludedCount")}: ${report.metadata.excludedCount} · ${t("analytics.geoCoveragePercent")}: ${show(report.metadata.geoCoveragePercent)}%`}
            />
            <Typography.Paragraph type="secondary">
              {t("analytics.definition")}
            </Typography.Paragraph>
            {tab === "overview" && (
              <>
                <Space wrap>
                  {metricKeys.map((key) => (
                    <Card key={key} size="small">
                      <Statistic
                        title={t("analytics." + key)}
                        value={show(
                          key === "playMs" && report.data[key] !== null
                            ? Number(report.data[key]) / 60000
                            : report.data[key],
                        )}
                      />
                    </Card>
                  ))}
                </Space>
                {table([report.data.activation], "activation")}
              </>
            )}
            {tab === "retention" && (
              <>
                <Select
                  value={cohort}
                  onChange={setCohort}
                  options={["access", "learning"].map((value) => ({
                    value,
                    label: t("analytics." + value),
                  }))}
                />
                <Table
                  scroll={{ x: true }}
                  size="small"
                  rowKey="cohortDate"
                  dataSource={retention}
                  columns={[
                    {
                      title: t("analytics.cohortDate"),
                      dataIndex: "cohortDate",
                    },
                    { title: t("analytics.size"), dataIndex: "size" },
                    {
                      title: "W1 (D7–D13)",
                      render: (
                        _: unknown,
                        row: NonNullable<typeof retention>[number],
                      ) =>
                        row.windowRetention.status === "complete"
                          ? `${row.windowRetention.retained} / ${row.windowRetention.denominator}`
                          : t("analytics." + row.windowRetention.status),
                    },
                    ...[1, 7, 30].map((offset) => ({
                      title: `D${offset}`,
                      render: (
                        _: unknown,
                        row: NonNullable<typeof retention>[number],
                      ) => {
                        const cell = row.cells.find((c) => c.offset === offset);
                        return !cell
                          ? t("analytics.unavailable")
                          : cell.status !== "complete"
                            ? t("analytics." + cell.status)
                            : `${cell.retained} / ${cell.denominator} (${cell.percent?.toFixed(1)}%)${Number(row.size) < 20 ? " *" : ""}`;
                      },
                    })),
                  ]}
                />
                <Typography.Text>{t("analytics.smallSample")}</Typography.Text>
                {table([report.data.weekly], "weekly")}
                {table(report.data.learningDays, "learningDays")}
                {table(report.data.accessDays, "accessDays")}
                {table(report.data.courseCoverage, "courseCoverage")}
              </>
            )}
            {tab === "geography" && (
              <>
                {table(report.data.countries, "countries")}
                <AcquisitionTable query={query} adminToken={adminToken} />
              </>
            )}
            {tab === "media-quality" && (
              <>
                {table(report.data.quality, "quality")}
                {table(report.data.uploads, "uploads")}
                <Alert
                  type="info"
                  message={t(
                    traffic?.data.status === "connected"
                      ? "analytics.trafficConnected"
                      : "analytics.trafficNotConnected",
                  )}
                  description={t("analytics.trafficDefinition")}
                />
                {traffic?.data.status === "connected" &&
                  table(traffic.data.rows, "traffic")}
              </>
            )}
            <details>
              <summary>{t("analytics.coverage")}</summary>
              {table(
                report.metadata.trackingStartedAtByMetricAndClient,
                "coverage",
              )}
              <CoverageEditor
                adminToken={adminToken}
                onSaved={() => setRefresh((v) => v + 1)}
              />
            </details>
            <Typography.Text type="secondary">
              {report.metadata.generatedAt}
            </Typography.Text>
          </>
        )}
        <Space wrap>
          <Typography.Text>{t("analytics.internalAccount")}</Typography.Text>
          <InputNumber
            min={1}
            value={internalId}
            onChange={setInternalId}
            placeholder={t("analytics.userId")}
          />
          <Switch checked={internal} onChange={setInternal} />
          <Button
            disabled={!internalId}
            onClick={() =>
              void apiClient
                .setAnalyticsInternal(internalId!, internal, adminToken)
                .then(() => setRefresh((v) => v + 1))
                .catch(() => setError(true))
            }
          >
            {t("analytics.save")}
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
function AcquisitionTable({
  query,
  adminToken,
}: {
  query: string;
  adminToken: string;
}) {
  const { t } = useAdminLanguage();
  const [data, setData] = useState<Row[]>([]);
  useEffect(() => {
    let active = true;
    void apiClient
      .getAnalyticsReport<Report>("acquisition", query, adminToken)
      .then((r) => {
        if (active) setData(r.data.channels as Row[]);
      })
      .catch(() => {
        if (active) setData([]);
      });
    return () => {
      active = false;
    };
  }, [query, adminToken]);
  return (
    <Card title={t("analytics.acquisition")}>
      <Table
        rowKey="source"
        size="small"
        dataSource={data}
        columns={[
          "source",
          "visitors",
          "viewed",
          "played",
          "trial",
          "registrations",
        ].map((key) => ({ title: t("analytics." + key), dataIndex: key }))}
      />
    </Card>
  );
}

function CoverageEditor({
  adminToken,
  onSaved,
}: {
  adminToken: string;
  onSaved: () => void;
}) {
  const { t } = useAdminLanguage();
  const [metric, setMetric] = useState("learning");
  const [clientType, setClient] = useState("web_app");
  const [status, setStatus] = useState("partial");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [zone, setZone] = useState("Asia/Shanghai");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const save = async () => {
    try {
      setError(false);
      await apiClient.setAnalyticsCoverage(
        {
          metric,
          clientType,
          status,
          startsAt: new Date(start).toISOString(),
          endsAt: end ? new Date(end).toISOString() : null,
          sourceTimezone: zone,
          note,
        },
        adminToken,
      );
      onSaved();
    } catch {
      setError(true);
    }
  };
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Alert type="warning" message={t("analytics.coverageWarning")} />
      <Space wrap>
        <Select
          value={metric}
          onChange={setMetric}
          options={[
            "learning",
            "legacy_access",
            "page_view",
            "media_quality",
          ].map((value) => ({ value, label: t("analytics." + value) }))}
        />
        <Select
          value={clientType}
          onChange={setClient}
          options={["web_app", "mobile_web", "mobile_app"].map((value) => ({
            value,
            label: t("analytics." + value),
          }))}
        />
        <Select
          value={status}
          onChange={setStatus}
          options={["partial", "outage", "complete"].map((value) => ({
            value,
            label: t("analytics." + value),
          }))}
        />
        <Select
          value={zone}
          onChange={setZone}
          options={["Asia/Shanghai", "Asia/Bangkok", "UTC"].map((value) => ({
            value,
            label: value,
          }))}
        />
      </Space>
      <Space wrap>
        <Input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label={t("analytics.startsAt")}
        />
        <Input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label={t("analytics.endsAt")}
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={255}
          placeholder={t("analytics.coverageNote")}
        />
        <Button disabled={!start || !note} onClick={() => void save()}>
          {t("analytics.configureCoverage")}
        </Button>
      </Space>
      {error && <Alert type="error" message={t("analytics.loadError")} />}
    </Space>
  );
}
