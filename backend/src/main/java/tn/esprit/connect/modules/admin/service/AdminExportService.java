package tn.esprit.connect.modules.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedWriter;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.Timestamp;

/**
 * Streams the users CSV export. Uses {@link JdbcTemplate#query(String,
 * org.springframework.jdbc.core.RowCallbackHandler)} so rows are flushed
 * one at a time instead of materialised in a {@code List<>} — keeps
 * memory flat regardless of the user count.
 *
 * The export joins {@code users} with {@code profiles} and {@code
 * promotions} so the operator gets the row in a single Excel-friendly
 * pass; the LEFT JOIN keeps users without a profile (e.g. early DRAFT
 * accounts) in the export instead of silently dropping them.
 */
@Service
@RequiredArgsConstructor
public class AdminExportService {

    private static final String[] HEADERS = {
            "id", "email", "role", "status",
            "first_name", "last_name", "country",
            "promotion_year", "created_at", "last_login_at",
    };

    private final JdbcTemplate jdbc;

    /**
     * Writes the entire (non-deleted) users table to {@code out} as CSV.
     * The first line is the header row; values are RFC-4180 quoted only
     * when they contain a comma, quote, or newline.
     *
     * Implementation notes:
     *  - One buffered writer over the output stream; we flush exactly once
     *    at the very end. Intermediate flushes used to confuse Tomcat into
     *    sending a Content-Length that didn't match the trailing buffered
     *    bytes — the browser then aborted with "Content-Length exceeds
     *    response Body". Letting Spring chunk-encode the response keeps
     *    things consistent regardless of payload size.
     *  - Build each row into a StringBuilder so a single {@code write()}
     *    call hits the writer per row. Fewer syscalls, easier to reason
     *    about, and no chance of a partial row being flushed mid-iteration.
     */
    @Transactional(readOnly = true)
    public void streamUsersCsv(OutputStream out) {
        try (BufferedWriter writer = new BufferedWriter(
                new OutputStreamWriter(out, StandardCharsets.UTF_8), 16 * 1024)) {

            // UTF-8 BOM so Excel opens accented characters correctly on Windows.
            writer.write('﻿');

            writer.write(String.join(",", HEADERS));
            writer.write("\r\n");

            jdbc.query("""
                    select u.id,
                           u.email,
                           u.role::text   as role,
                           u.status::text as status,
                           p.first_name,
                           p.last_name,
                           p.country,
                           pr.year         as promotion_year,
                           u.created_at,
                           u.last_login_at
                      from users u
                      left join profiles  p  on p.user_id = u.id and p.deleted_at is null
                      left join promotions pr on pr.id = p.promotion_id and pr.deleted_at is null
                     where u.deleted_at is null
                     order by u.created_at desc
                    """, (ResultSet rs) -> {
                try {
                    StringBuilder row = new StringBuilder(256);
                    appendCsvRow(row,
                            rs.getString("id"),
                            rs.getString("email"),
                            rs.getString("role"),
                            rs.getString("status"),
                            rs.getString("first_name"),
                            rs.getString("last_name"),
                            rs.getString("country"),
                            stringify(rs.getObject("promotion_year")),
                            timestampToIso(rs.getTimestamp("created_at")),
                            timestampToIso(rs.getTimestamp("last_login_at"))
                    );
                    row.append("\r\n");
                    writer.write(row.toString());
                } catch (java.io.IOException e) {
                    throw new RuntimeException("Failed to write CSV row", e);
                }
            });
            // try-with-resources will flush + close. No mid-stream flush.
        } catch (java.io.IOException e) {
            throw new RuntimeException("Failed to write CSV body", e);
        }
    }

    /** Appends an RFC-4180 row to {@code sb}. No trailing newline. */
    private static void appendCsvRow(StringBuilder sb, String... values) {
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(csvEscape(values[i]));
        }
    }

    /**
     * Wraps {@code value} in double quotes and doubles any internal
     * quotes only when the value needs it. Plain alphanumeric strings
     * pass through untouched — keeps the CSV readable in a text editor.
     */
    private static String csvEscape(String value) {
        if (value == null) return "";
        boolean mustQuote = value.indexOf(',') >= 0
                || value.indexOf('"') >= 0
                || value.indexOf('\n') >= 0
                || value.indexOf('\r') >= 0;
        if (!mustQuote) return value;
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private static String stringify(Object o) {
        return o == null ? "" : o.toString();
    }

    /** Compact ISO-8601 in UTC; empty string when null. */
    private static String timestampToIso(Timestamp ts) {
        return ts == null ? "" : ts.toInstant().toString();
    }
}
