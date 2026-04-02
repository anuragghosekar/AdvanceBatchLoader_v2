using Microsoft.AspNetCore.Mvc;
using Aras.IOM;
using Advance_Batch_Loader.Models;
using Advance_Batch_Loader.Services;
using Newtonsoft.Json;
using OfficeOpenXml.Table.PivotTable;
using OfficeOpenXml;


namespace Advance_Batch_Loader.Controllers
{

    [ApiController]
    [Route("api/import")]
    public class ImportController : ControllerBase
    {
        private readonly ExcelService _excelService;
        private readonly ImportService _importService;
        private readonly ArasConnectionService _connection;

        public ImportController(
            ExcelService excelService,
            ImportService importService,
            ArasConnectionService connection)
        {
            _excelService = excelService;
            _importService = importService;
            _connection = connection;
        }

        [HttpPost("bom")]
        public IActionResult ImportBom(
            IFormFile dataFile,
            IFormFile mappingFile,
            [FromForm] string requestJson)
        {
            try
            {
                var request = JsonConvert.DeserializeObject<ImportRequest>(requestJson);
                using var mappingStream = mappingFile.OpenReadStream();
                var mappings = _excelService.ParseMappingExcel(mappingStream);
                using var dataStream = dataFile.OpenReadStream();
                using var package = new ExcelPackage(dataStream);
                var sheet = package.Workbook.Worksheets[0];
                mappings = _excelService.ResolveColumnIndexes(sheet, mappings);
                dataStream.Position = 0;
                var rows = _excelService.ParseExcel(dataStream, mappings);
                dataStream.Position = 0;
                var itemNumberMapping = mappings
                    .FirstOrDefault(m => m.PropertyName == "item_number");
                if (itemNumberMapping == null)
                    throw new Exception("Mapping for item_number is required.");
                int itemNumberColumn = itemNumberMapping.ColumnIndex;
                var quantityMapping = mappings.FirstOrDefault(m => m.PropertyName.Equals("quantity", StringComparison.OrdinalIgnoreCase));
                int quantityColumn = quantityMapping?.ColumnIndex ?? -1;
                var bomRows = _excelService.ParseBom(
                    dataStream,
                    itemNumberColumn, quantityColumn);


                return Ok(new
                {
                    rows = rows,
                    bom = bomRows,
                    itemType = request.ItemType
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    error = ex.Message,
                    stack = ex.StackTrace
                });
            }
        }
        }

    }

