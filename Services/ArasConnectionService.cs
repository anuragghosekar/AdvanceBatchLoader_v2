using Advance_Batch_Loader.Models;
using Aras.IOM;

namespace Advance_Batch_Loader.Services
{
    public class ArasConnectionService
    {
        public Innovator Connect(ConnectionRequest request)
        {
            HttpServerConnection conn = IomFactory.CreateHttpServerConnection(
                request.ServerUrl,
                request.Database,
                request.Username,
                request.Password);

            Item loginResult = conn.Login();

            if (loginResult.isError() || loginResult.isEmpty())
            {
                throw new Exception(loginResult.getErrorString());
            }

            return IomFactory.CreateInnovator(conn);
        }
    }
}
