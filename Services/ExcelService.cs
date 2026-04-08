using Advance_Batch_Loader.Models;
using OfficeOpenXml;

public class ExcelService
{
    public List<object> ReadHeaders(Stream stream)
    {
        using var package = new ExcelPackage(stream);
        var sheet = package.Workbook.Worksheets[0];

        int columnCount = sheet.Dimension.Columns;

        var headers = new List<object>();

        for (int col = 1; col <= columnCount; col++)
        {
            var header = sheet.Cells[1, col].Text.Trim();

            if (!string.IsNullOrWhiteSpace(header))
            {
                headers.Add(new
                {
                    columnIndex = col,
                    columnName = header
                });
            }
        }

        return headers;
    }

    public List<ColumnMapping> ParseMappingExcel(Stream stream)
    {
        using var package = new ExcelPackage(stream);
        var sheet = package.Workbook.Worksheets[0];

        int rowCount = sheet.Dimension.Rows;
        var mappings = new List<ColumnMapping>();
        for (int row = 2; row <= rowCount; row++)
        {
            var excelColumn = sheet.Cells[row, 1].Text.Trim();
            var arasProperty = sheet.Cells[row, 2].Text.Trim();

            if (string.IsNullOrWhiteSpace(excelColumn) ||
                string.IsNullOrWhiteSpace(arasProperty))
                continue;
            mappings.Add(new ColumnMapping
            {
                ExcelColumnName = excelColumn,
                PropertyName = arasProperty
            });
        }
        return mappings;
    }

    public List<ColumnMapping> ResolveColumnIndexes(
    ExcelWorksheet sheet,
    List<ColumnMapping> mappings)
    {
        int columnCount = sheet.Dimension.Columns;
        for (int col = 1; col <= columnCount; col++)
        {
            var header = sheet.Cells[1, col].Text.Trim();
            foreach (var map in mappings.Where(m => m.ExcelColumnName == header))
            {
                map.ColumnIndex = col;
            }
        }
        return mappings;
    }

    public List<Dictionary<string, string>> ParseExcel(
        Stream stream,
        List<ColumnMapping> mappings)
    {
        using var package = new ExcelPackage(stream);
        var sheet = package.Workbook.Worksheets[0];
        int rowCount = sheet.Dimension.Rows;
        var rows = new List<Dictionary<string, string>>();
        for (int row = 2; row <= rowCount; row++)
        {
            var data = new Dictionary<string, string>();
            foreach (var map in mappings)
            {
                if (map.ColumnIndex <= 0 || map.ColumnIndex > sheet.Dimension.Columns)
                    continue;
                var value = sheet.Cells[row, map.ColumnIndex].Text?.Trim();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    data[map.PropertyName] = value;
                }
            }
            if (data.Count > 0)
                rows.Add(data);
        }
        return rows;
    }


    public List<BomData> ParseBom(Stream stream, int itemNumberColumn, int quantityColumn)

    {
        using var package = new ExcelPackage(stream);
        var sheet = package.Workbook.Worksheets[0];
        int rowCount = sheet.Dimension.Rows;
        int columnCount = sheet.Dimension.Columns;
        int parentColumn = -1;
        for (int col = 1; col <= columnCount; col++)
        {
            var header = sheet.Cells[1, col].Text.Trim();
            if (header.Equals("Parent Part", StringComparison.OrdinalIgnoreCase))
            {
                parentColumn = col;
                break;
            }
        }
        var bomRows = new List<BomData>();
        if (parentColumn == -1)
            return bomRows;
        for (int row = 2; row <= rowCount; row++)
        {
            var parent = sheet.Cells[row, parentColumn].Text.Trim();
            var child = sheet.Cells[row, itemNumberColumn].Text.Trim();
            if (string.IsNullOrWhiteSpace(parent) ||
                string.IsNullOrWhiteSpace(child))
                continue;
            int qty = 1;
            if (quantityColumn != -1)
            {
                var qtyText = sheet.Cells[row, quantityColumn].Text.Trim();
                if (!string.IsNullOrWhiteSpace(qtyText) &&
                    int.TryParse(qtyText, out int parsedQty))
                {
                    qty = parsedQty;
                }
            }
            bomRows.Add(new BomData
            {
                ParentPart = parent,
                ChildPart = child,
                Quantity = qty
            });
        }
        return bomRows;
    }


    private int DetectParentColumn(ExcelWorksheet sheet)
    {
        int columnCount = sheet.Dimension.Columns;
        for (int col = 1; col <= columnCount; col++)
        {
            var header = sheet.Cells[1, col].Text.Trim().ToLower();
            if (header.Contains("parent"))
            {
                return col;
            }
        }
        return -1;
    }

}
