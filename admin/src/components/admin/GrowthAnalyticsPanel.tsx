import { useEffect, useState, type ReactNode } from "react";
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
  Tooltip,
} from "antd";
import {
  analyticsRows,
  analyticsDisplayValue,
  currentAnalyticsReport,
  type AnalyticsReportResult,
  retentionRows,
  type RetentionCell,
  type RetentionCohort,
} from "../../lib/analyticsReportState";
import { apiClient } from "../../lib/apiClient";
import { useAdminLanguage } from "../../i18n/AdminLanguageProvider";
import { statDate } from "@duolinting/domain";
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
    observedVersions?: Row[];
    geoCollection?: { provider: string };
  };
  data: Record<string, unknown>;
};
const day = (offset = 0) =>
  statDate(Date.now() + offset * 86400000);
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
export function GrowthAnalyticsPanel({
  adminToken,
  accessOverview,
  accessLoading,
  onRefreshAccess,
}: {
  adminToken: string;
  accessOverview: ReactNode;
  accessLoading: boolean;
  onRefreshAccess: () => void;
}) {
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
  const [matureWindow, setMatureWindow] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [reportResult, setReportResult] =
    useState<AnalyticsReportResult<Report> | null>(null);
  const [trafficResult, setTrafficResult] =
    useState<AnalyticsReportResult<Report> | null>(null);
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
    ...(tab === "retention" ? { matureWindow } : {}),
    ...(country ? { countryCode: country } : {}),
    ...(build ? { appBuild: build } : {}),
    ...(exercise ? { exerciseId: String(exercise) } : {}),
    ...(media ? { mediaType: media } : {}),
  }).toString();
  // Include identity and refresh generation so old responses cannot reappear after reloading.
  const requestKey = JSON.stringify([tab, query, adminToken, refresh]);
  const report = currentAnalyticsReport(reportResult, requestKey);
  const traffic = currentAnalyticsReport(trafficResult, requestKey);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    setReportResult(null);
    setTrafficResult(null);
    void apiClient
      .getAnalyticsReport<Report>(tab, query, adminToken)
      .then((r) => {
        if (current) setReportResult({ requestKey, report: r });
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
          if (current) setTrafficResult({ requestKey, report: r });
        })
        .catch(() => {
          if (current) setTrafficResult(null);
        });
    return () => {
      current = false;
    };
  }, [tab, query, adminToken, refresh, requestKey]);
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
    const data = analyticsRows(values);
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
            render: (value: unknown) =>
              k === "endsAt" && value === null ? t("analytics.ongoing")
                : ["status", "clientType", "metric"].includes(k) && typeof value === "string"
                  ? t("analytics." + value)
                  : show(analyticsDisplayValue(k, value)),
          }))}
      />
    );
  };
  const retention = retentionRows(
    analyticsRows(report?.data.cohorts) as RetentionCohort[], matureWindow,
  );
  const retentionValue = (cell: RetentionCell | undefined, smallSample: boolean) => {
    if (!cell) return t("analytics.unavailable");
    if (cell.status === "observing") return (
      <Space direction="vertical" size={0}>
        <Typography.Text type="secondary">{t("analytics.observing")}</Typography.Text>
        {cell.availableOn && <Typography.Text type="secondary">{cell.availableOn} {t("analytics.availableOn")}</Typography.Text>}
      </Space>
    );
    if (cell.status === "complete") return `${cell.retained} / ${cell.denominator}${cell.percent === undefined ? "" : ` (${cell.percent?.toFixed(1)}%)`}${smallSample ? " *" : ""}`;
    // A zero observed count means no recorded return, not proven zero retention.
    // Never render a percentage for an unverified observation window.
    return (
      <Tooltip title={(cell.incompleteReasons ?? ["unverified_coverage"]).map((reason) => t("analytics.reason." + reason)).join(" ")}>
        <Space direction="vertical" size={0}>
          <Typography.Text>{cell.observedRetained === null || cell.observedRetained === undefined
            ? t("analytics.incomplete")
            : `${t("analytics.observedReturns")} ${cell.observedRetained} / ${cell.denominator}${smallSample ? " *" : ""}`}</Typography.Text>
          <Typography.Text type="warning">{t("analytics.rateUnverified")}</Typography.Text>
        </Space>
      </Tooltip>
    );
  };
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
          <Button
            onClick={() => {
              setRefresh((v) => v + 1);
              onRefreshAccess();
            }}
            loading={loading || (tab === "overview" && accessLoading)}
          >
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
            {report.metadata.warnings.filter((warning) => [
              "coverage_not_configured", "unknown_geography",
              "unknown_build", "registration_client_unknown",
            ].includes(warning)).map((warning) => (
              <Typography.Text key={warning} type="warning">{t("analytics.warning." + warning)}</Typography.Text>
            ))}
            <Typography.Paragraph type="secondary">
              {t("analytics.definition")}
            </Typography.Paragraph>
            {report.metadata.geoCollection?.provider === "dbip_lite" && (
              <Typography.Link href="https://db-ip.com" target="_blank" rel="noopener noreferrer">{t("analytics.geoAttribution")}</Typography.Link>
            )}
            {tab === "overview" && (
              <>
                <Space wrap>
                  {metricKeys.map((key) => (
                    <Card key={key} size="small">
                      <Statistic
                        title={t("analytics." + key)}
                        value={show(
                          analyticsDisplayValue(key, report.data[key]),
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
                <Alert type="info" showIcon message={t("analytics.retentionExplanation")} />
                <Space wrap>
                <Select
                  value={cohort}
                  onChange={setCohort}
                  options={["access", "learning"].map((value) => ({
                    value,
                    label: t("analytics." + value),
                  }))}
                />
                <Select
                  aria-label={t("analytics.maturityFilter")}
                  value={matureWindow}
                  onChange={setMatureWindow}
                  options={[
                    { value: "all", label: t("analytics.allCohorts") },
                    ...[1, 7, 30].map((offset) => ({ value: String(offset), label: `D${offset} · ${t("analytics.matureOnly")}` })),
                    { value: "w1", label: `W1 · ${t("analytics.matureOnly")}` },
                  ]}
                />
                </Space>
                <Table
                  key={JSON.stringify([query, matureWindow])}
                  scroll={{ x: true }}
                  size="small"
                  rowKey="cohortDate"
                  dataSource={retention}
                  locale={{ emptyText: t(matureWindow === "all" ? "analytics.noCohorts" : "analytics.noMatureCohorts") }}
                  columns={[
                    {
                      title: t("analytics.cohortDate"),
                      dataIndex: "cohortDate",
                      sorter: (a, b) => a.cohortDate.localeCompare(b.cohortDate),
                      defaultSortOrder: "descend",
                      sortDirections: ["descend", "ascend"],
                    },
                    { title: t("analytics.size"), dataIndex: "size" },
                    {
                      title: "W1 (D7–D13)",
                      render: (
                        _: unknown,
                        row: RetentionCohort,
                      ) =>
                        retentionValue(row.windowRetention, Number(row.size) < 20),
                    },
                    ...[1, 7, 30].map((offset) => ({
                      title: `D${offset}`,
                      render: (
                        _: unknown,
                        row: RetentionCohort,
                      ) => {
                        const cell = row.cells?.find(
                          (c) => c.offset === offset,
                        );
                        return retentionValue(cell, Number(row.size) < 20);
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
              {table(report.metadata.observedVersions, "observedVersions")}
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
        {tab === "overview" && accessOverview}
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
                .then(() => {
                  setRefresh((v) => v + 1);
                  onRefreshAccess();
                })
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
  const [result, setResult] = useState<AnalyticsReportResult<Row[]> | null>(
    null,
  );
  const requestKey = JSON.stringify([query, adminToken]);
  const data = currentAnalyticsReport(result, requestKey) ?? [];
  useEffect(() => {
    let active = true;
    void apiClient
      .getAnalyticsReport<Report>("acquisition", query, adminToken)
      .then((r) => {
        if (active)
          setResult({ requestKey, report: analyticsRows(r.data.channels) });
      })
      .catch(() => {
        if (active) setResult({ requestKey, report: [] });
      });
    return () => {
      active = false;
    };
  }, [query, adminToken, requestKey]);
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
