using Advance_Batch_Loader.Models;
using Advance_Batch_Loader.Services;
using Aras.IOM;
using Microsoft.AspNetCore.Mvc;

namespace Advance_Batch_Loader.Controllers
{
    [ApiController]
    [Route("api/aras")]
    public class ArasMetadataController : ControllerBase
    {
        private readonly ArasConnectionService _connection;

        public ArasMetadataController(ArasConnectionService connection)
        {
            _connection = connection;
        }

        [HttpPost("properties")]
        public IActionResult GetProperties([FromBody] ConnectionRequest request, [FromQuery] string itemType)
        {
            try
            {
                // DEBUG LINES
                Console.WriteLine("ItemType: " + itemType);
                Console.WriteLine("ServerUrl: " + request.ServerUrl);
                Console.WriteLine("Database: " + request.Database);
                Console.WriteLine("Username: " + request.Username);

                Innovator inn = _connection.Connect(request);

                string aml = $@"
                <AML>
                    <Item type='Property' action='get' select='name,label'>
                        <source_id>
                            <Item type='ItemType' action='get'>
                                <name>{itemType}</name>
                            </Item>
                        </source_id>
                    </Item>
                </AML>";

                Item result = inn.applyAML(aml);

                var properties = new List<object>();

                for (int i = 0; i < result.getItemCount(); i++)
                {
                    Item prop = result.getItemByIndex(i);

                    properties.Add(new
                    {
                        name = prop.getProperty("name"),
                        label = prop.getProperty("label")
                    });
                }

                return Ok(properties);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }
    }
}