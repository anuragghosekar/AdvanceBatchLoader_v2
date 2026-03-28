namespace Advance_Batch_Loader.Models
{
    public class ImportRequest
    {
        public string ItemType { get; set; }
        //public List<ColumnMapping> Mappings { get; set; }
        public ConnectionRequest Connection { get; set; }
    }
}
