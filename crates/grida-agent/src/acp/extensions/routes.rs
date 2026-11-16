//! Typed extension requests share one ACP dispatch handler.

use agent_client_protocol::v1::{ConnectionTo, Responder};
use agent_client_protocol::{
    Client, Dispatch, HandleDispatchFrom, Handled, JsonRpcRequest, Result, UntypedMessage, V1,
};
use futures_util::future::BoxFuture;
use std::future::ready;
use std::marker::PhantomData;

#[derive(Default)]
pub(super) struct RequestRoutes(Vec<Box<dyn Route>>);

impl RequestRoutes {
    pub(super) fn on_receive_request<Req, F, ToFut>(
        mut self,
        operation: F,
        to_future: ToFut,
    ) -> Self
    where
        Req: JsonRpcRequest,
        F: AsyncFnMut(Req, Responder<Req::Response>, ConnectionTo<Client>) -> Result<()>
            + Send
            + 'static,
        ToFut: Fn(
                &mut F,
                Req,
                Responder<Req::Response>,
                ConnectionTo<Client>,
            ) -> BoxFuture<'_, Result<()>>
            + Send
            + 'static,
    {
        self.0.push(Box::new(TypedRoute {
            operation,
            to_future,
            request: PhantomData,
        }));
        self
    }

    pub(super) fn extend(mut self, other: Self) -> Self {
        self.0.extend(other.0);
        self
    }
}

impl HandleDispatchFrom<Client> for RequestRoutes {
    async fn handle_dispatch_from(
        &mut self,
        dispatch: Dispatch,
        connection: agent_client_protocol::ConnectionTo<Client>,
    ) -> Result<Handled<Dispatch>> {
        // Keep typed SDK handles and pass unrelated messages through untouched.
        let message = match dispatch {
            Dispatch::Request(request, responder) => {
                if let Some(route) = self
                    .0
                    .iter_mut()
                    .find(|route| route.matches(&request.method))
                {
                    route
                        .invoke(
                            request,
                            responder.into_protocol::<V1>()?,
                            connection.into_protocol::<V1>()?,
                        )
                        .await?;
                    return Ok(Handled::Yes);
                }
                Dispatch::Request(request, responder)
            }
            other => other,
        };
        Ok(Handled::No {
            message,
            retry: false,
        })
    }

    fn describe_chain(&self) -> impl std::fmt::Debug {
        ("Grida extension requests", self.0.len())
    }
}

trait Route: Send {
    fn matches(&self, method: &str) -> bool;
    fn invoke(
        &mut self,
        request: UntypedMessage,
        responder: Responder,
        connection: ConnectionTo<Client>,
    ) -> BoxFuture<'_, Result<()>>;
}

struct TypedRoute<Req, F, ToFut> {
    operation: F,
    to_future: ToFut,
    request: PhantomData<fn(Req)>,
}

impl<Req, F, ToFut> Route for TypedRoute<Req, F, ToFut>
where
    Req: JsonRpcRequest,
    F: Send,
    ToFut: Fn(&mut F, Req, Responder<Req::Response>, ConnectionTo<Client>) -> BoxFuture<'_, Result<()>>
        + Send,
{
    fn matches(&self, method: &str) -> bool {
        Req::matches_method(method)
    }

    fn invoke(
        &mut self,
        request: UntypedMessage,
        responder: Responder,
        connection: ConnectionTo<Client>,
    ) -> BoxFuture<'_, Result<()>> {
        match Req::parse_message(&request.method, &request.params) {
            Ok(request) => {
                (self.to_future)(&mut self.operation, request, responder.cast(), connection)
            }
            Err(error) => Box::pin(ready(Err(error))),
        }
    }
}
