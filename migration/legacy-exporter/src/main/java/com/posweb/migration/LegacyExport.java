package com.posweb.migration;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class LegacyExport {
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public static void main(String[] args) throws Exception {
        Map<String, String> options = parseArgs(args);
        String jdbc = options.get("jdbc");
        String outDir = options.getOrDefault("out", "./export");
        String user = options.get("user");
        String password = options.get("password");

        if (jdbc == null) {
            System.err.println("Usage: --jdbc <jdbc-url> [--user <user>] [--password <pass>] [--out <dir>]");
            System.exit(1);
        }

        File out = new File(outDir);
        if (!out.exists() && !out.mkdirs()) {
            throw new IllegalStateException("Failed to create output directory: " + out.getAbsolutePath());
        }

        try (Connection connection = (user == null)
                ? DriverManager.getConnection(jdbc)
                : DriverManager.getConnection(jdbc, user, password)) {

            DatabaseMetaData meta = connection.getMetaData();
            List<String> tables = new ArrayList<>();
            String currentCatalog = connection.getCatalog();

            try (ResultSet rs = meta.getTables(currentCatalog, null, "%", new String[]{"TABLE"})) {
                while (rs.next()) {
                    String schema = rs.getString("TABLE_SCHEM");
                    String catalog = rs.getString("TABLE_CAT");
                    String name = rs.getString("TABLE_NAME");
                    if (isSystemSchema(schema) || isSystemSchema(catalog)) {
                        continue;
                    }
                    tables.add(name);
                }
            }

            for (String table : tables) {
                exportTable(connection, table, out, currentCatalog);
            }

            System.out.println("Exported " + tables.size() + " tables to " + out.getAbsolutePath());
        }
    }

    private static void exportTable(Connection connection, String table, File outDir, String catalog) throws Exception {
        String fileName = table.toLowerCase(Locale.ROOT) + ".json";
        File outFile = new File(outDir, fileName);

        JsonFactory factory = new JsonFactory();
        try (FileOutputStream fos = new FileOutputStream(outFile);
             JsonGenerator gen = factory.createGenerator(fos, com.fasterxml.jackson.core.JsonEncoding.UTF8)) {

            gen.writeStartArray();
            String qualified = (catalog != null && !catalog.isEmpty())
                    ? String.format("`%s`.`%s`", catalog, table)
                    : table;
            try (Statement stmt = connection.createStatement();
                 ResultSet rs = stmt.executeQuery("SELECT * FROM " + qualified)) {

                ResultSetMetaData md = rs.getMetaData();
                int cols = md.getColumnCount();

                while (rs.next()) {
                    gen.writeStartObject();
                    for (int i = 1; i <= cols; i++) {
                        String name = md.getColumnLabel(i);
                        Object value = rs.getObject(i);
                        writeValue(gen, name, value);
                    }
                    gen.writeEndObject();
                }
            }
            gen.writeEndArray();
        }
    }

    private static void writeValue(JsonGenerator gen, String name, Object value) throws Exception {
        if (value == null) {
            gen.writeNullField(name);
            return;
        }
        if (value instanceof Timestamp) {
            gen.writeStringField(name, ((Timestamp) value).toLocalDateTime().format(ISO));
            return;
        }
        if (value instanceof java.util.Date) {
            gen.writeStringField(name, value.toString());
            return;
        }
        if (value instanceof byte[]) {
            String encoded = Base64.getEncoder().encodeToString((byte[]) value);
            gen.writeStringField(name, encoded);
            return;
        }
        if (value instanceof Number) {
            gen.writeNumberField(name, ((Number) value).doubleValue());
            return;
        }
        gen.writeStringField(name, value.toString());
    }

    private static boolean isSystemSchema(String schema) {
        if (schema == null) {
            return false;
        }
        String s = schema.toUpperCase(Locale.ROOT);
        return s.startsWith("SYS") || s.startsWith("INFORMATION_SCHEMA") || s.startsWith("MYSQL");
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> map = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (arg.startsWith("--")) {
                String key = arg.substring(2);
                String value = (i + 1 < args.length) ? args[i + 1] : null;
                if (value != null && !value.startsWith("--")) {
                    map.put(key, value);
                    i++;
                } else {
                    map.put(key, "true");
                }
            }
        }
        return map;
    }
}
