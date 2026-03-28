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
                // Step 1: Parse Mapping Excel

                using var mappingStream = mappingFile.OpenReadStream();

                var mappings = _excelService.ParseMappingExcel(mappingStream);

                // Step 2: Read Data Excel

                using var dataStream = dataFile.OpenReadStream();

                using var package = new ExcelPackage(dataStream);
                var sheet = package.Workbook.Worksheets[0];

                // Resolve column indexes from headers
                mappings = _excelService.ResolveColumnIndexes(sheet, mappings);

                // Reset stream so Excel can be read again
                dataStream.Position = 0;

                // Step 3: Parse rows using mapping

                var rows = _excelService.ParseExcel(dataStream, mappings);

                // Reset stream again for BOM parsing
                dataStream.Position = 0;

                // Step 4: Find item_number column

                var itemNumberMapping = mappings
                    .FirstOrDefault(m => m.PropertyName == "item_number");

                if (itemNumberMapping == null)
                    throw new Exception("Mapping for item_number is required.");

                int itemNumberColumn = itemNumberMapping.ColumnIndex;

                // Step 5: Parse BOM

                var bomRows = _excelService.ParseBom(
                    dataStream,
                    itemNumberColumn);

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

