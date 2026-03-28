namespace Advance_Batch_Loader.Models
{
    public class PartData
    {
        public string ItemNumber { get; set; }

        public Dictionary<string, string> Properties { get; set; } = new();
    }
}
