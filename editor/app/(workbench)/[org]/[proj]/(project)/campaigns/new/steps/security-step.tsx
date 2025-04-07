"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shield, User, Users, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SecurityStepProps {
  data: any;
  updateData: (data: any) => void;
}

export function SecurityStep({ data, updateData }: SecurityStepProps) {
  // Sample data for visualization
  const referrers = [
    {
      id: 1,
      name: "Alex Johnson",
      invitees: 3,
      avatar: "AJ",
      image: "/mock/avatars/avatar-01.png",
    },
    {
      id: 2,
      name: "Sam Wilson",
      invitees: 2,
      avatar: "SW",
      image: "/mock/avatars/avatar-02.png",
    },
  ];

  const invitees = [
    {
      id: 1,
      referrerId: 1,
      name: "Taylor Smith",
      avatar: "TS",
      image: "/mock/avatars/avatar-03.png",
    },
    {
      id: 2,
      referrerId: 1,
      name: "Jordan Lee",
      avatar: "JL",
      image: "/mock/avatars/avatar-04.png",
    },
    {
      id: 3,
      referrerId: 1,
      name: "Casey Brown",
      avatar: "CB",
      image: "/mock/avatars/avatar-05.png",
    },
    {
      id: 4,
      referrerId: 2,
      name: "Riley Garcia",
      avatar: "RG",
      image: "/mock/avatars/avatar-06.png",
    },
    {
      id: 5,
      referrerId: 2,
      name: "Morgan Chen",
      avatar: "MC",
      image: "/mock/avatars/avatar-07.png",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Security Settings</h3>
          <p className="text-muted-foreground">
            Configure privacy and security options for your referral campaign.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md">
            <h4 className="text-yellow-800 font-medium mb-2">
              Privacy Considerations
            </h4>
            <p className="text-sm text-yellow-700">
              Be careful with exposing user profiles. This should align with
              your privacy policy and user expectations.
            </p>
          </div>

          <div className="space-y-4 p-4 border rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="expose-referrer" className="font-medium">
                  Expose Referrer Profiles
                </Label>
                <p className="text-sm text-muted-foreground">
                  Show referrer profiles (name and avatar) to people they invite
                </p>
              </div>
              <Switch
                id="expose-referrer"
                checked={data.is_referrer_name_exposed_to_public_dangerously}
                onCheckedChange={(checked) =>
                  updateData({
                    is_referrer_name_exposed_to_public_dangerously: checked,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="expose-invitee" className="font-medium">
                  Expose Invitee Profiles
                </Label>
                <p className="text-sm text-muted-foreground">
                  Show invitee profiles (name and avatar) to the people who
                  referred them
                </p>
              </div>
              <Switch
                id="expose-invitee"
                checked={data.is_invitee_name_exposed_to_public_dangerously}
                onCheckedChange={(checked) =>
                  updateData({
                    is_invitee_name_exposed_to_public_dangerously: checked,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="font-medium">Visualization Preview</h4>
          <p className="text-sm text-muted-foreground mb-4">
            This is how your referral hierarchy will appear to users based on
            your privacy settings.
          </p>

          <div className="space-y-6">
            <div className="p-4 border rounded-md">
              <h5 className="text-sm font-medium mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                What invitees will see
              </h5>
              <div className="p-3 bg-muted/10 rounded-md">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    {data.is_referrer_name_exposed_to_public_dangerously && (
                      <AvatarImage
                        src={referrers[0].image}
                        alt={referrers[0].name}
                      />
                    )}
                    <AvatarFallback>{referrers[0].avatar}</AvatarFallback>
                  </Avatar>
                  <div>
                    {data.is_referrer_name_exposed_to_public_dangerously ? (
                      <p className="text-sm font-medium">{referrers[0].name}</p>
                    ) : (
                      <p className="text-sm font-medium text-muted-foreground">
                        Anonymous Referrer
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Invited you to join
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-md">
              <h5 className="text-sm font-medium mb-2 flex items-center">
                <User className="h-4 w-4 mr-1" />
                What referrers will see
              </h5>
              <div className="p-3 bg-muted/10 rounded-md">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={referrers[0].image}
                        alt={referrers[0].name}
                      />
                      <AvatarFallback>{referrers[0].avatar}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {referrers[0].name} (You)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Invited {referrers[0].invitees} people
                      </p>
                    </div>
                  </div>

                  <div className="pl-10 space-y-2 border-l ml-4">
                    {invitees
                      .filter((i) => i.referrerId === 1)
                      .map((invitee) => (
                        <div
                          key={invitee.id}
                          className="flex items-center gap-3 relative"
                        >
                          <ChevronRight className="h-3 w-3 text-muted-foreground absolute -ml-5" />
                          <Avatar className="h-6 w-6">
                            {data.is_invitee_name_exposed_to_public_dangerously && (
                              <AvatarImage
                                src={invitee.image}
                                alt={invitee.name}
                              />
                            )}
                            <AvatarFallback className="text-xs">
                              {invitee.avatar}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            {data.is_invitee_name_exposed_to_public_dangerously ? (
                              <p className="text-sm">{invitee.name}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Anonymous Invitee
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-muted/20 rounded-md">
        <h4 className="font-medium mb-3">What This Means</h4>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium">Referrer Profile Exposure:</p>
            <p className="text-sm text-muted-foreground">
              {data.is_referrer_name_exposed_to_public_dangerously
                ? "Invitees will see who invited them with name and avatar."
                : "Invitees will not see who invited them by name or avatar."}
            </p>
            <div className="mt-2 p-3 bg-muted/20 rounded-md">
              <p className="text-xs">
                {data.is_referrer_name_exposed_to_public_dangerously
                  ? '"Join Alex\'s team and get rewards!"'
                  : '"Someone invited you to join and get rewards!"'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Invitee Profile Exposure:</p>
            <p className="text-sm text-muted-foreground">
              {data.is_invitee_name_exposed_to_public_dangerously
                ? "Referrers will see the names and avatars of people who accepted their invitations."
                : "Referrers will not see the names or avatars of people who accepted their invitations."}
            </p>
            <div className="mt-2 p-3 bg-muted/20 rounded-md">
              <p className="text-xs">
                {data.is_invitee_name_exposed_to_public_dangerously
                  ? '"Taylor, Jordan, and 1 other joined through your link!"'
                  : '"3 people joined through your link!"'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
