using Microsoft.AspNetCore.Mvc;

namespace Advance_Batch_Loader.Controllers
{
    [ApiController]
    [Route("api/excel")]
    public class ExcelController : ControllerBase
    {
        private readonly ExcelService _excelService;

        public ExcelController(ExcelService excelService)
        {
            _excelService = excelService;
        }

        [HttpPost("headers")]
        public IActionResult GetHeaders(IFormFile file)
        {
            if (file == null)
                return BadRequest("File missing");

            using var stream = file.OpenReadStream();

            var headers = _excelService.ReadHeaders(stream);

            return Ok(headers);
        }
    }
}
