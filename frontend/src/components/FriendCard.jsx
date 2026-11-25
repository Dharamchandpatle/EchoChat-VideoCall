import { Link } from "react-router";
import FriendSafetyMenu from "./FriendSafetyMenu";
import { getLanguageFlag } from "../lib/languageFlag";
import { getAvatarUrl, handleAvatarError } from "../lib/avatar";

const FriendCard  = ({ friend }) => {
  return (
    <div className="card bg-base-200 hover:shadow-md transition-shadow">
      <div className="card-body p-4">
        <div className="flex justify-end -mt-2 -mb-1">
          <FriendSafetyMenu friendId={friend._id} friendName={friend.fullName} />
        </div>
        {/* USER INFO */}
        <div className="flex items-center gap-3 mb-3">
          <div className="avatar size-12">
            <img
              src={getAvatarUrl(friend.profilePic)}
              alt={friend.fullName}
              onError={handleAvatarError}
            />
          </div>
          <h3 className="font-semibold truncate">{friend.fullName}</h3>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="badge badge-secondary text-xs">
            {getLanguageFlag(friend.nativeLanguage)}
            Native: {friend.nativeLanguage}
          </span>
          <span className="badge badge-outline text-xs">
            {getLanguageFlag(friend.learningLanguage)}
            Learning: {friend.learningLanguage}
          </span>
        </div>

        <Link to={`/chat/${friend._id}`} className="btn btn-outline w-full">
          Message
        </Link>
      </div>
    </div>
  );
};
export default FriendCard;
