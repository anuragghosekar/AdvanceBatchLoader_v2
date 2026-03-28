using Advance_Batch_Loader.Models;
using Aras.IOM;
using System.Security;
using System.Text;

namespace Advance_Batch_Loader.Services
{
    public class ImportService
    {

        private Dictionary<string, string> GetExistingParts(
            Innovator inn,
            IEnumerable<string> partNumbers)
        {
            var list = partNumbers.ToList();

            if (!list.Any())
                return new Dictionary<string, string>();

            string inClause = string.Join(",", list.Select(p => $"'{p}'"));

            string aml = $@"
                         <AML>
                         <Item type='Part' action='get' select='id,item_number'>
                             <item_number condition='in'>{inClause}</item_number>
                         </Item>
                         </AML>";

            Item result = inn.applyAML(aml);

            var dict = new Dictionary<string, string>();

            for (int i = 0; i < result.getItemCount(); i++)
            {
                var item = result.getItemByIndex(i);

                dict[item.getProperty("item_number")] = item.getID();
            }

            return dict;
        }

        public List<object> ImportItems(
    Innovator inn,
    string itemType,
    List<Dictionary<string, string>> rows)
        {
            int batchSize = 200;

            var results = new List<object>();

            for (int i = 0; i < rows.Count; i += batchSize)
            {
                var batch = rows.Skip(i).Take(batchSize).ToList();

                var sb = new StringBuilder();
                sb.Append("<AML>");

                foreach (var row in batch)
                {
                    if (!row.ContainsKey("item_number"))
                        continue;

                    sb.Append($"<Item type='{itemType}' action='add'>");

                    foreach (var prop in row)
                    {
                        if (string.IsNullOrWhiteSpace(prop.Value))
                            continue;

                        var value = SecurityElement.Escape(prop.Value);
                        sb.Append($"<{prop.Key}>{value}</{prop.Key}>");
                    }

                    sb.Append("</Item>");
                }

                sb.Append("</AML>");

                Item res = inn.applyAML(sb.ToString());

                // ✅ If batch succeeds → mark all success
                if (!res.isError())
                {
                    foreach (var row in batch)
                    {
                        results.Add(new
                        {
                            item = row.ContainsKey("item_number") ? row["item_number"] : "",
                            status = "SUCCESS"
                        });
                    }
                }
                else
                {
                    // ❌ Batch failed → fallback to row-by-row
                    foreach (var row in batch)
                    {
                        try
                        {
                            var singleAml = new StringBuilder();
                            singleAml.Append("<AML>");
                            singleAml.Append($"<Item type='{itemType}' action='add'>");

                            foreach (var prop in row)
                            {
                                if (string.IsNullOrWhiteSpace(prop.Value))
                                    continue;

                                var value = SecurityElement.Escape(prop.Value);
                                singleAml.Append($"<{prop.Key}>{value}</{prop.Key}>");
                            }

                            singleAml.Append("</Item></AML>");

                            Item singleRes = inn.applyAML(singleAml.ToString());

                            if (singleRes.isError())
                            {
                                results.Add(new
                                {
                                    item = row.ContainsKey("item_number") ? row["item_number"] : "",
                                    status = "FAILED",
                                    error = singleRes.getErrorString()
                                });
                            }
                            else
                            {
                                results.Add(new
                                {
                                    item = row.ContainsKey("item_number") ? row["item_number"] : "",
                                    status = "SUCCESS"
                                });
                            }
                        }
                        catch (Exception ex)
                        {
                            results.Add(new
                            {
                                item = row.ContainsKey("item_number") ? row["item_number"] : "",
                                status = "FAILED",
                                error = ex.Message
                            });
                        }
                    }
                }
            }

            return results;
        }

        public void CreateBom(
            Innovator inn,
            List<BomData> rows)
        {

            var allParts = rows
                .SelectMany(r => new[] { r.ParentPart, r.ChildPart })
                .Distinct()
                .ToList();

            var partMap = GetExistingParts(inn, allParts);

            int batchSize = 500;

            for (int i = 0; i < rows.Count; i += batchSize)
            {
                var batch = rows.Skip(i).Take(batchSize);

                var sb = new StringBuilder();
                sb.Append("<AML>");

                foreach (var row in batch)
                {
                    if (!partMap.ContainsKey(row.ParentPart) ||
                        !partMap.ContainsKey(row.ChildPart))
                    {
                        continue;
                    }

                    var parentId = partMap[row.ParentPart];
                    var childId = partMap[row.ChildPart];

                    sb.Append($@"
                        <Item type='Part BOM' action='add'>
                            <source_id>{parentId}</source_id>
                            <related_id>{childId}</related_id>
                            <quantity>{row.Quantity}</quantity>
                        </Item>");

                }

                sb.Append("</AML>");

                inn.applyAML(sb.ToString());
            }


        }

        private void CreatePartsBatch(Innovator inn, List<PartData> parts)
        {
            var sb = new StringBuilder();
            sb.Append("<AML>");

            foreach (var part in parts)
            {
                sb.Append("<Item type='Part' action='add'>");

                foreach (var prop in part.Properties)
                {
                    if (string.IsNullOrWhiteSpace(prop.Value))
                        continue;

                    var value = SecurityElement.Escape(prop.Value);

                    sb.Append($"<{prop.Key}>{value}</{prop.Key}>");
                }

                sb.Append("</Item>");
            }

            sb.Append("</AML>");

            inn.applyAML(sb.ToString());
        }
    
    }

}